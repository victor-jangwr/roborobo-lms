package kr.roborobo.lms

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.provider.CallLog
import android.provider.MediaStore
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * 갤럭시 '통화 자동 녹음' 파일을 찾아 LMS 서버로 올립니다.
 * - 처음 켠 뒤에 생긴 녹음만 봅니다 (예전 녹음은 올리지 않음)
 * - 통화 기록으로 상대 번호를 찾고, LMS 설정(끄기/테스트/전체)과 학부모 번호인지 확인한 뒤에만 올립니다
 * - 서버가 Gemini 로 정리하면 상담 '검토 대기'에 들어가고, 서버의 녹음 파일은 바로 지워집니다
 */
object CallUploader {
    private const val MAX_BYTES = 19 * 1024 * 1024
    private var policy: JSONObject? = null
    private var policyAt = 0L

    val mediaPerm: String
        get() = if (Build.VERSION.SDK_INT >= 33) Manifest.permission.READ_MEDIA_AUDIO else Manifest.permission.READ_EXTERNAL_STORAGE

    private fun prefs(ctx: Context) = ctx.getSharedPreferences("lms_calls", Context.MODE_PRIVATE)

    /** 켤 때: 지금 이후 녹음만 보도록 기준 시각을 맞춤 */
    fun resetBaseline(ctx: Context) {
        prefs(ctx).edit().putLong("since", System.currentTimeMillis() / 1000).putInt("tries", 0).apply()
    }

    private fun policy(api: Api): JSONObject {
        val now = System.currentTimeMillis()
        if (policy == null || now - policyAt > 60_000) { policy = api.callPolicy(); policyAt = now }
        return policy!!
    }

    private fun digits(s: String?) = (s ?: "").filter { it.isDigit() }

    /** 새 녹음이 있으면 올림. 서비스가 20초마다 부름 */
    fun check(ctx: Context, api: Api) {
        if (!api.callUpload || !api.loggedIn) return
        if (ctx.checkSelfPermission(mediaPerm) != PackageManager.PERMISSION_GRANTED) return
        if (ctx.checkSelfPermission(Manifest.permission.READ_CALL_LOG) != PackageManager.PERMISSION_GRANTED) return
        val p = prefs(ctx)
        var since = p.getLong("since", 0L)
        if (since == 0L) { resetBaseline(ctx); return }
        val nowSec = System.currentTimeMillis() / 1000

        val proj = mutableListOf(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DISPLAY_NAME, MediaStore.Audio.Media.DATE_ADDED, MediaStore.Audio.Media.SIZE, MediaStore.Audio.Media.MIME_TYPE)
        if (Build.VERSION.SDK_INT >= 29) proj.add(MediaStore.Audio.Media.RELATIVE_PATH)
        val cur = ctx.contentResolver.query(
            MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, proj.toTypedArray(),
            "${MediaStore.Audio.Media.DATE_ADDED} > ? AND ${MediaStore.Audio.Media.DATE_ADDED} < ?",
            arrayOf(since.toString(), (nowSec - 15).toString()),
            "${MediaStore.Audio.Media.DATE_ADDED} ASC",
        ) ?: return
        cur.use { c ->
            while (c.moveToNext()) {
                val id = c.getLong(0)
                val name = c.getString(1) ?: ""
                val added = c.getLong(2)
                val size = c.getLong(3)
                val mime = c.getString(4) ?: "audio/m4a"
                val rel = if (Build.VERSION.SDK_INT >= 29) c.getString(5) ?: "" else ""
                val isCall = rel.contains("Call", true) || rel.contains("통화") || name.contains("통화") || name.contains("Call", true)
                if (!isCall) { since = added; p.edit().putLong("since", since).apply(); continue }
                val done = try {
                    handle(ctx, api, ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id), name, added, size, mime)
                } catch (e: Exception) {
                    AppLog.add(ctx, "녹음 올리기 실패: ${e.message}")
                    false
                }
                val tries = p.getInt("tries", 0)
                if (done || tries >= 2) {
                    since = added; p.edit().putLong("since", since).putInt("tries", 0).apply()
                } else {
                    p.edit().putInt("tries", tries + 1).apply()
                    return   // 다음 확인 때 다시 시도
                }
            }
        }
    }

    /** true = 처리 끝(올렸거나 올리지 않기로 함), false = 나중에 다시 시도 */
    private fun handle(ctx: Context, api: Api, uri: android.net.Uri, name: String, added: Long, size: Long, mime: String): Boolean {
        // 1) 통화 기록에서 이 녹음의 통화 찾기 (녹음 파일이 생긴 시각 = 통화 끝난 시각 근처)
        val endMs = added * 1000
        var number: String? = null; var type = 0; var dur = 0L; var start = 0L
        ctx.contentResolver.query(
            CallLog.Calls.CONTENT_URI, arrayOf(CallLog.Calls.NUMBER, CallLog.Calls.TYPE, CallLog.Calls.DURATION, CallLog.Calls.DATE),
            "${CallLog.Calls.DATE} > ? AND ${CallLog.Calls.DATE} < ?", arrayOf((endMs - 3 * 3600_000).toString(), (endMs + 60_000).toString()),
            "${CallLog.Calls.DATE} DESC",
        )?.use { c ->
            var best = Long.MAX_VALUE
            while (c.moveToNext()) {
                val d = c.getLong(2); val s = c.getLong(3)
                val gap = kotlin.math.abs(s + d * 1000 - endMs)
                if (d > 0 && gap < best && gap < 180_000) { best = gap; number = c.getString(0); type = c.getInt(1); dur = d; start = s }
            }
        }
        val phone = digits(number)
        if (phone.isEmpty()) { AppLog.add(ctx, "녹음 건너뜀: 통화 기록을 찾지 못했어요 ($name)"); return true }
        val masked = if (phone.length >= 8) phone.take(3) + "-****-" + phone.takeLast(4) else phone

        // 2) LMS 설정 확인
        val pol = policy(api)
        val mode = pol.optString("mode", "off")
        if (mode == "off") { AppLog.add(ctx, "녹음 건너뜀: LMS에서 녹음 올리기가 꺼져 있어요"); return true }
        if (mode == "test") {
            val arr = pol.optJSONArray("numbers")
            val allowed = (0 until (arr?.length() ?: 0)).map { digits(arr!!.optString(it)) }
            if (phone !in allowed) { AppLog.add(ctx, "녹음 건너뜀: 테스트 번호가 아니에요 ($masked)"); return true }
        }
        // 3) 학부모 번호인지
        if (api.lookupCaller(phone).length() == 0) { AppLog.add(ctx, "녹음 건너뜀: 학부모 번호가 아니에요 ($masked)"); return true }
        if (size > MAX_BYTES) { AppLog.add(ctx, "녹음 건너뜀: 통화가 너무 길어요 (약 30분 이하만)"); return true }

        // 4) 올리고 정리 요청
        val bytes = ctx.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return false
        val ext = name.substringAfterLast('.', "m4a").lowercase()
        val path = "${pol.optString("branch_id")}/${added}_$phone.$ext"
        AppLog.add(ctx, "통화 녹음 올리는 중 → $masked (${dur / 60}분 ${dur % 60}초)")
        api.upload(path, bytes, if (ext == "m4a") "audio/mp4" else mime)
        val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(start))
        val r = api.function("lms-call-summarize", JSONObject()
            .put("path", path).put("phone", phone)
            .put("direction", if (type == CallLog.Calls.OUTGOING_TYPE) "out" else "in")
            .put("durationSec", dur).put("startedAt", iso))
        if (r.optBoolean("ok")) { AppLog.add(ctx, "통화 정리 완료 → ${r.optString("student")} 학부모 (LMS 상담 검토 대기)"); return true }
        if (r.optBoolean("skipped")) { AppLog.add(ctx, "녹음 건너뜀: ${r.optString("message")}"); return true }
        AppLog.add(ctx, "통화 정리 실패: ${r.optString("message")}")
        return false
    }
}

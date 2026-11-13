package kr.roborobo.lms

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** LMS 서버(Supabase) 호출. 로그인 토큰은 기기에만 저장합니다. */
class Api(context: Context) {
    val prefs: SharedPreferences = context.getSharedPreferences("lms", Context.MODE_PRIVATE)

    var url: String
        get() = prefs.getString("url", "") ?: ""
        set(v) = prefs.edit().putString("url", v.trim().trimEnd('/')).apply()
    var key: String
        get() = prefs.getString("key", "") ?: ""
        set(v) = prefs.edit().putString("key", v.trim()).apply()
    var email: String
        get() = prefs.getString("email", "") ?: ""
        set(v) = prefs.edit().putString("email", v.trim()).apply()
    var device: String
        get() = prefs.getString("device", "") ?: ""
        set(v) = prefs.edit().putString("device", v.trim()).apply()
    var enabled: Boolean
        get() = prefs.getBoolean("enabled", false)
        set(v) = prefs.edit().putBoolean("enabled", v).apply()
    var callUpload: Boolean
        get() = prefs.getBoolean("callUpload", false)
        set(v) = prefs.edit().putBoolean("callUpload", v).apply()
    var callerId: Boolean
        get() = prefs.getBoolean("callerId", true)
        set(v) = prefs.edit().putBoolean("callerId", v).apply()

    private var access: String
        get() = prefs.getString("access", "") ?: ""
        set(v) = prefs.edit().putString("access", v).apply()
    private var refresh: String
        get() = prefs.getString("refresh", "") ?: ""
        set(v) = prefs.edit().putString("refresh", v).apply()
    private var expiresAt: Long
        get() = prefs.getLong("expiresAt", 0)
        set(v) = prefs.edit().putLong("expiresAt", v).apply()

    val loggedIn: Boolean get() = refresh.isNotEmpty() && url.isNotEmpty() && key.isNotEmpty()

    class HttpError(val code: Int, message: String) : IOException(message)

    private fun http(method: String, path: String, body: String?, auth: Boolean): String {
        val c = URL(url + path).openConnection() as HttpURLConnection
        c.requestMethod = method
        c.connectTimeout = 15000
        c.readTimeout = 20000
        c.setRequestProperty("apikey", key)
        c.setRequestProperty("Content-Type", "application/json")
        c.setRequestProperty("Authorization", "Bearer " + if (auth) access else key)
        if (body != null) {
            c.doOutput = true
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
        }
        val code = c.responseCode
        val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
        c.disconnect()
        if (code !in 200..299) throw HttpError(code, readableError(text, code))
        return text
    }

    private fun readableError(text: String, code: Int): String = try {
        val o = JSONObject(text)
        val m = o.optString("msg", o.optString("message", o.optString("error_description", o.optString("error", text))))
        when {
            m.contains("Invalid login credentials") -> "이메일 또는 비밀번호가 맞지 않아요"
            m.contains("Email not confirmed") -> "이메일 인증이 아직 안 됐어요"
            else -> m
        }
    } catch (e: Exception) { "서버 오류 ($code)" }

    private fun saveTokens(o: JSONObject) {
        access = o.getString("access_token")
        refresh = o.getString("refresh_token")
        expiresAt = System.currentTimeMillis() / 1000 + o.optLong("expires_in", 3600)
    }

    fun signIn(password: String) {
        val body = JSONObject().put("email", email).put("password", password).toString()
        saveTokens(JSONObject(http("POST", "/auth/v1/token?grant_type=password", body, false)))
    }

    fun signOut() {
        access = ""; refresh = ""; expiresAt = 0; enabled = false
    }

    @Synchronized
    private fun ensureToken() {
        if (refresh.isEmpty()) throw IOException("로그인이 필요해요")
        if (System.currentTimeMillis() / 1000 < expiresAt - 60) return
        val body = JSONObject().put("refresh_token", refresh).toString()
        saveTokens(JSONObject(http("POST", "/auth/v1/token?grant_type=refresh_token", body, false)))
    }

    /** 서버 함수 호출 (만료된 토큰은 한 번 새로 받아 다시 시도) */
    fun rpc(name: String, args: JSONObject = JSONObject()): String {
        ensureToken()
        return try {
            http("POST", "/rest/v1/rpc/$name", args.toString(), true)
        } catch (e: HttpError) {
            if (e.code != 401) throw e
            expiresAt = 0; ensureToken()
            http("POST", "/rest/v1/rpc/$name", args.toString(), true)
        }
    }

    fun me(): JSONObject? {
        val t = rpc("lms_me").trim()
        return if (t.isEmpty() || t == "null") null else JSONObject(t)
    }

    fun claim(limit: Int = 5): JSONArray =
        JSONArray(rpc("lms_claim_sms", JSONObject().put("p_device", device.ifEmpty { "휴대폰" }).put("p_limit", limit)))

    fun finish(id: String, ok: Boolean, error: String?) {
        rpc("lms_finish_sms", JSONObject().put("p_id", id).put("p_ok", ok).put("p_error", error ?: JSONObject.NULL))
    }

    /** 녹음 올리기 정책: mode(off/test/all), numbers(테스트 번호), branch_id */
    fun callPolicy(): JSONObject = JSONObject(rpc("lms_call_policy"))

    /** 녹음 파일을 Supabase Storage(call-recordings)에 올림 */
    fun upload(path: String, bytes: ByteArray, mime: String) {
        ensureToken()
        val c = URL("$url/storage/v1/object/call-recordings/$path").openConnection() as HttpURLConnection
        c.requestMethod = "POST"
        c.connectTimeout = 20000
        c.readTimeout = 120000
        c.doOutput = true
        c.setRequestProperty("apikey", key)
        c.setRequestProperty("Authorization", "Bearer $access")
        c.setRequestProperty("Content-Type", mime)
        c.setFixedLengthStreamingMode(bytes.size)
        c.outputStream.use { it.write(bytes) }
        val code = c.responseCode
        val text = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        c.disconnect()
        if (code !in 200..299) throw HttpError(code, readableError(text, code))
    }

    /** Edge Function 호출 (원장 로그인 토큰으로) */
    fun function(name: String, body: JSONObject): JSONObject {
        ensureToken()
        val text = try { http("POST", "/functions/v1/$name", body.toString(), true) } catch (e: HttpError) {
            if (e.code != 401) throw e
            expiresAt = 0; ensureToken(); http("POST", "/functions/v1/$name", body.toString(), true)
        }
        return try { JSONObject(text) } catch (e: Exception) { JSONObject().put("ok", false).put("message", text.take(200)) }
    }

    fun lookupCaller(phone: String): JSONArray =
        JSONArray(rpc("lms_lookup_caller", JSONObject().put("p_phone", phone)))
}

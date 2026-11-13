package kr.roborobo.lms

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.telephony.SmsManager
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * 서버의 문자 대기열을 5초마다 확인해서, 이 휴대폰의 문자로 보냅니다.
 * 화면을 꺼도 계속 돌도록 알림이 떠 있는 '포그라운드 서비스'로 실행됩니다.
 */
class SmsService : Service() {
    companion object {
        const val CHANNEL = "sms_service"
        const val ACTION_SENT = "kr.roborobo.lms.SMS_SENT"
        @Volatile var running = false
        @Volatile var lastError: String = ""
        val sentToday = AtomicInteger(0)

        fun start(ctx: Context) {
            val i = Intent(ctx, SmsService::class.java)
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i) else ctx.startService(i)
        }
        fun stop(ctx: Context) { ctx.stopService(Intent(ctx, SmsService::class.java)) }
    }

    private class Pending(parts: Int) { val latch = CountDownLatch(parts); val ok = AtomicBoolean(true); @Volatile var code = 0 }
    private val pending = ConcurrentHashMap<String, Pending>()
    private val stopFlag = AtomicBoolean(false)
    private var worker: Thread? = null
    private var wake: PowerManager.WakeLock? = null

    private val sentReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            val id = i.getStringExtra("id") ?: return
            val p = pending[id] ?: return
            if (resultCode != android.app.Activity.RESULT_OK) { p.ok.set(false); p.code = resultCode }
            p.latch.countDown()
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "문자 발송", NotificationManager.IMPORTANCE_LOW))
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(sentReceiver, IntentFilter(ACTION_SENT), Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(sentReceiver, IntentFilter(ACTION_SENT))
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val n = notification("학원폰 연결 중")
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(1, n)
        if (worker?.isAlive != true) {
            stopFlag.set(false)
            worker = Thread({ loop() }, "sms-loop").also { it.start() }
        }
        running = true
        return START_STICKY
    }

    override fun onDestroy() {
        stopFlag.set(true)
        worker?.interrupt()
        running = false
        try { unregisterReceiver(sentReceiver) } catch (_: Exception) {}
        wake?.let { if (it.isHeld) it.release() }
        super.onDestroy()
    }

    private fun notification(text: String): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle("로보로보 LMS")
            .setContentText(text)
            .setContentIntent(open)
            .setOngoing(true)
            .build()
    }

    private fun update(text: String) {
        getSystemService(NotificationManager::class.java).notify(1, notification(text))
    }

    private fun loop() {
        val api = Api(this)
        val pm = getSystemService(PowerManager::class.java)
        var backoff = 5000L
        AppLog.add(this, "문자 발송을 시작했어요")
        var tick = 0
        while (!stopFlag.get()) {
            try {
                if (!api.loggedIn || (!api.enabled && !api.callUpload)) { Thread.sleep(5000); continue }
                if (api.enabled) {
                    val jobs = api.claim(5)
                    lastError = ""
                    if (jobs.length() > 0) {
                        wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lms:sms").apply { acquire(5 * 60 * 1000L) }
                        for (k in 0 until jobs.length()) {
                            val j = jobs.getJSONObject(k)
                            val id = j.getString("id")
                            val to = j.getString("to_phone")
                            val (ok, err) = send(id, to, j.getString("body"))
                            try { api.finish(id, ok, err) } catch (e: Exception) { AppLog.add(this, "결과 전송 실패: ${e.message}") }
                            if (ok) sentToday.incrementAndGet()
                            AppLog.add(this, if (ok) "발송 완료 → ${mask(to)}" else "발송 실패 → ${mask(to)} ($err)")
                            Thread.sleep(1500) // 연속 발송 간격 (스팸 차단 예방)
                        }
                        wake?.let { if (it.isHeld) it.release() }
                    }
                }
                // 통화 녹음은 20초마다 확인
                if (api.callUpload && tick % 4 == 0) {
                    try { CallUploader.check(this, api) } catch (e: Exception) { AppLog.add(this, "녹음 확인 실패: ${e.message}") }
                }
                tick++
                update(listOfNotNull(if (api.enabled) "문자 발송 대기 중 · ${sentToday.get()}건 발송" else null, if (api.callUpload) "통화 녹음 정리 켜짐" else null).joinToString(" · "))
                backoff = 5000L
                Thread.sleep(5000)
            } catch (e: InterruptedException) {
                break
            } catch (e: Exception) {
                lastError = e.message ?: e.toString()
                if (e is Api.HttpError && (e.code == 400 || e.code == 403)) {
                    AppLog.add(this, "서버 오류: $lastError")
                }
                update("연결 문제 · 잠시 후 다시 시도 ($lastError)")
                try { Thread.sleep(backoff) } catch (_: InterruptedException) { break }
                backoff = (backoff * 2).coerceAtMost(60_000L)
            }
        }
    }

    private fun mask(p: String) = if (p.length >= 8) p.take(3) + "-****-" + p.takeLast(4) else p

    @Suppress("DEPRECATION")
    private fun smsManager(): SmsManager =
        if (Build.VERSION.SDK_INT >= 31) getSystemService(SmsManager::class.java) else SmsManager.getDefault()

    /** 문자 한 건 보내고 결과를 최대 60초 기다림 */
    private fun send(id: String, to: String, body: String): Pair<Boolean, String?> {
        return try {
            val sm = smsManager()
            val parts = sm.divideMessage(body)
            val p = Pending(parts.size)
            pending[id] = p
            val intents = ArrayList<PendingIntent>()
            for (i in parts.indices) {
                val it = Intent(ACTION_SENT).setPackage(packageName).putExtra("id", id)
                intents.add(PendingIntent.getBroadcast(this, (id.hashCode() * 31) + i, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
            }
            if (parts.size == 1) sm.sendTextMessage(to, null, body, intents[0], null)
            else sm.sendMultipartTextMessage(to, null, parts, intents, null)
            val done = p.latch.await(60, TimeUnit.SECONDS)
            pending.remove(id)
            when {
                !done -> false to "휴대폰에서 발송 응답이 없어요"
                p.ok.get() -> true to null
                else -> false to errorText(p.code)
            }
        } catch (e: SecurityException) {
            false to "문자 보내기 권한이 없어요"
        } catch (e: Exception) {
            false to (e.message ?: "알 수 없는 오류")
        }
    }

    private fun errorText(code: Int) = when (code) {
        SmsManager.RESULT_ERROR_NO_SERVICE -> "통신 신호 없음"
        SmsManager.RESULT_ERROR_RADIO_OFF -> "비행기 모드 또는 통신 꺼짐"
        SmsManager.RESULT_ERROR_NULL_PDU -> "문자 형식 오류"
        SmsManager.RESULT_ERROR_GENERIC_FAILURE -> "통신사 발송 실패"
        else -> "발송 실패 ($code)"
    }
}

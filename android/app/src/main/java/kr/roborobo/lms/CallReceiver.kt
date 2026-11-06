package kr.roborobo.lms

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Notification
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager

/** 전화가 오면 LMS 에서 학부모를 찾아 알림으로 보여 줍니다. */
class CallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.getStringExtra(TelephonyManager.EXTRA_STATE) != TelephonyManager.EXTRA_STATE_RINGING) return
        @Suppress("DEPRECATION")
        val number = intent.getStringExtra(TelephonyManager.EXTRA_INCOMING_NUMBER) ?: return
        val api = Api(context)
        if (!api.loggedIn || !api.callerId) return
        val pr = goAsync()
        Thread {
            try {
                val rows = api.lookupCaller(number)
                if (rows.length() > 0) {
                    val names = (0 until rows.length()).joinToString(", ") {
                        val r = rows.getJSONObject(it)
                        r.optString("student_name") + (r.optString("grade").takeIf { g -> g.isNotBlank() && g != "null" }?.let { g -> " ($g)" } ?: "")
                    }
                    val parent = rows.getJSONObject(0).optString("parent_name").takeIf { it.isNotBlank() && it != "null" }
                    show(context, "${names} 학부모님 전화", parent?.let { "$it 님 · ${format(number)}" } ?: format(number))
                    AppLog.add(context, "전화 수신: $names 학부모")
                }
            } catch (e: Exception) {
                AppLog.add(context, "발신자 찾기 실패: ${e.message}")
            } finally { pr.finish() }
        }.start()
    }

    private fun format(n: String): String {
        val d = n.filter { it.isDigit() }
        return if (d.length == 11) "${d.take(3)}-${d.substring(3, 7)}-${d.takeLast(4)}" else n
    }

    private fun show(ctx: Context, title: String, text: String) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("caller", "전화 수신 학부모 표시", NotificationManager.IMPORTANCE_HIGH))
        val n = Notification.Builder(ctx, "caller")
            .setSmallIcon(android.R.drawable.sym_call_incoming)
            .setContentTitle(title)
            .setContentText(text)
            .setCategory(Notification.CATEGORY_CALL)
            .setAutoCancel(true)
            .setTimeoutAfter(60_000)
            .build()
        nm.notify(2, n)
    }
}

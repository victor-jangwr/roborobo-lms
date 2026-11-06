package kr.roborobo.lms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 휴대폰을 껐다 켜거나 앱을 업데이트해도 문자 발송이 다시 켜지도록 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val api = Api(context)
        if (api.enabled && api.loggedIn) {
            try { SmsService.start(context) } catch (_: Exception) { }
        }
    }
}

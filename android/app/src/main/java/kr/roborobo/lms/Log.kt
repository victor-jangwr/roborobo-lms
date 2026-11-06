package kr.roborobo.lms

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** 화면에 보여줄 최근 기록 (최대 40줄) */
object AppLog {
    private val fmt = SimpleDateFormat("MM-dd HH:mm:ss", Locale.KOREA)
    var listener: (() -> Unit)? = null

    fun add(ctx: Context, text: String) {
        val p = ctx.getSharedPreferences("lms_log", Context.MODE_PRIVATE)
        val lines = (p.getString("lines", "") ?: "").split("\n").filter { it.isNotBlank() }.take(39)
        p.edit().putString("lines", (listOf("${fmt.format(Date())}  $text") + lines).joinToString("\n")).apply()
        listener?.invoke()
    }

    fun read(ctx: Context): String =
        ctx.getSharedPreferences("lms_log", Context.MODE_PRIVATE).getString("lines", "") ?: ""
}

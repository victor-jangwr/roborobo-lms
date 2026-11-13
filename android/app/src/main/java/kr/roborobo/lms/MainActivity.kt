package kr.roborobo.lms

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast

/** 설정 화면: 서버 연결 · 로그인 · 권한 · 문자 발송 켜기 */
class MainActivity : Activity() {
    private lateinit var api: Api
    private val ui = Handler(Looper.getMainLooper())
    private val accent = Color.parseColor("#3B6EE6")
    private val ink = Color.parseColor("#1B2230")
    private val muted = Color.parseColor("#6B7385")

    private lateinit var root: LinearLayout
    private lateinit var status: TextView
    private lateinit var logView: TextView

    private val PERMS: Array<String> by lazy {
        val p = mutableListOf(Manifest.permission.SEND_SMS, Manifest.permission.READ_PHONE_STATE, Manifest.permission.READ_CALL_LOG, CallUploader.mediaPerm)
        if (Build.VERSION.SDK_INT >= 33) p.add(Manifest.permission.POST_NOTIFICATIONS)
        p.toTypedArray()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        api = Api(this)
        window.statusBarColor = Color.WHITE
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
        build()
    }

    override fun onResume() {
        super.onResume()
        AppLog.listener = { ui.post { refreshLog() } }
        refresh()
    }

    override fun onPause() { AppLog.listener = null; super.onPause() }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    private fun text(s: String, size: Float = 15f, color: Int = ink, bold: Boolean = false) = TextView(this).apply {
        text = s; textSize = size; setTextColor(color); if (bold) typeface = Typeface.DEFAULT_BOLD
        setPadding(0, dp(4), 0, dp(4))
    }

    private fun input(hint: String, value: String, type: Int = InputType.TYPE_CLASS_TEXT) = EditText(this).apply {
        this.hint = hint; setText(value); inputType = type; textSize = 15f; setSingleLine(true)
    }

    private fun button(label: String, primary: Boolean = false, onClick: () -> Unit) = Button(this).apply {
        text = label; isAllCaps = false; textSize = 15f
        setTextColor(if (primary) Color.WHITE else accent)
        background = GradientDrawable().apply { cornerRadius = dp(10).toFloat(); if (primary) setColor(accent) else { setColor(Color.WHITE); setStroke(dp(1), accent) } }
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)).apply { topMargin = dp(8) }
        setOnClickListener { onClick() }
    }

    private fun card(): LinearLayout = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(16), dp(14), dp(16), dp(16))
        background = GradientDrawable().apply { cornerRadius = dp(14).toFloat(); setColor(Color.WHITE); setStroke(dp(1), Color.parseColor("#E3E6EC")) }
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(12) }
    }

    private fun build() {
        val scroll = ScrollView(this).apply { setBackgroundColor(Color.parseColor("#F5F6F8")) }
        root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(20), dp(16), dp(32)) }
        scroll.addView(root)
        setContentView(scroll)
        render()
    }

    private fun render() {
        root.removeAllViews()
        root.addView(text("로보로보 LMS", 24f, ink, true))
        root.addView(text("학원 휴대폰용 · 출결 문자 발송 · 전화 수신 시 학부모 표시", 13f, muted))

        status = text("", 14f, ink).apply { setPadding(dp(14), dp(12), dp(14), dp(12)) }
        root.addView(status, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(12) })

        if (!api.loggedIn) renderLogin() else renderMain()

        val logCard = card()
        logCard.addView(text("최근 기록", 15f, ink, true))
        logView = text("", 12f, muted).apply { typeface = Typeface.MONOSPACE }
        logCard.addView(logView)
        root.addView(logCard)
        refresh()
    }

    private fun renderLogin() {
        val c = card()
        c.addView(text("서버 연결", 16f, ink, true))
        c.addView(text("LMS 웹 화면에서 쓰는 것과 같은 Supabase 주소·키와 원장 계정으로 로그인하세요.", 13f, muted))
        val url = input("https://xxxx.supabase.co", api.url, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI)
        val key = input("anon(publishable) 키", api.key)
        val email = input("원장 이메일", api.email, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        val pw = input("비밀번호", "", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        val dev = input("이 휴대폰 이름 (예: 원장폰)", api.device.ifEmpty { Build.MODEL })
        listOf(url, key, email, pw, dev).forEach { c.addView(it) }
        c.addView(button("로그인", true) {
            api.url = url.text.toString(); api.key = key.text.toString(); api.email = email.text.toString(); api.device = dev.text.toString()
            val password = pw.text.toString()
            status.text = "로그인 중…"
            Thread {
                try {
                    api.signIn(password)
                    val me = api.me()
                    ui.post {
                        when {
                            me == null -> { api.signOut(); toast("이 계정은 아직 학원에 연결되지 않았어요. 웹에서 먼저 학원을 만들어 주세요.") }
                            me.optString("role") != "owner" -> { api.signOut(); toast("문자 발송은 원장 계정으로 로그인해야 해요.") }
                            else -> { AppLog.add(this, "${me.optString("branch_name")} 원장 계정으로 로그인"); render() }
                        }
                        refresh()
                    }
                } catch (e: Exception) { ui.post { status.text = "로그인 실패: ${e.message}" } }
            }.start()
        })
        root.addView(c)
    }

    private fun renderMain() {
        val c = card()
        c.addView(text("문자 발송 · 통화 녹음", 16f, ink, true))
        c.addView(text("켜 두면 LMS 출결 문자를 이 휴대폰의 문자로 보냅니다. 휴대폰 요금제의 문자가 사용돼요.", 13f, muted))
        c.addView(Switch(this).apply {
            text = "문자 발송 켜기"; textSize = 15f; isChecked = api.enabled && SmsService.running
            setPadding(0, dp(10), 0, dp(6))
            setOnCheckedChangeListener { _, on ->
                if (on && !hasPerm(Manifest.permission.SEND_SMS)) {
                    isChecked = false
                    toast("문자 권한이 없어서 켤 수 없어요. 권한을 허용한 뒤 다시 켜 주세요.")
                    askPerms(); return@setOnCheckedChangeListener
                }
                api.enabled = on
                if (on || api.callUpload) SmsService.start(this@MainActivity) else SmsService.stop(this@MainActivity)
                ui.postDelayed({ refresh() }, 400)
            }
        })
        c.addView(Switch(this).apply {
            text = "상담 통화 녹음 정리 (LMS 설정에 따름)"; textSize = 15f; isChecked = api.callUpload
            setPadding(0, dp(6), 0, dp(6))
            setOnCheckedChangeListener { _, on ->
                if (on && (!hasPerm(CallUploader.mediaPerm) || !hasPerm(Manifest.permission.READ_CALL_LOG))) {
                    isChecked = false
                    toast("녹음 파일·통화 기록 권한이 필요해요. 권한을 허용한 뒤 다시 켜 주세요.")
                    askPerms(); return@setOnCheckedChangeListener
                }
                api.callUpload = on
                if (on) { CallUploader.resetBaseline(this@MainActivity); AppLog.add(this@MainActivity, "통화 녹음 정리를 켰어요 (지금 이후 통화부터)") }
                if (on || api.enabled) SmsService.start(this@MainActivity) else SmsService.stop(this@MainActivity)
                ui.postDelayed({ refresh() }, 400)
            }
        })
        c.addView(text("갤럭시 전화 앱 설정 → 통화 녹음 → '통화 자동 녹음'을 켜 두세요. 무엇을 올릴지는 LMS 설정 → 상담 녹음에서 정해요(끄기 / 테스트 번호만 / 전체).", 12f, muted))
        c.addView(Switch(this).apply {
            text = "전화 오면 학부모 이름 알림"; textSize = 15f; isChecked = api.callerId
            setPadding(0, dp(6), 0, dp(6))
            setOnCheckedChangeListener { _, on -> api.callerId = on; if (on) askPerms() }
        })
        root.addView(c)

        val p = card()
        p.addView(text("권한 · 배터리", 16f, ink, true))
        p.addView(text("문자 보내기, 전화 상태, 통화 기록(발신 번호 확인), 알림 권한이 필요해요. 배터리 최적화에서 빼야 화면이 꺼져도 문자가 나가요.", 13f, muted))
        p.addView(button("권한 허용하기") { askPerms() })
        p.addView(button("앱 설정 열기 (권한이 안 켜질 때)") { openAppSettings(PERMS.filter { !hasPerm(it) }) })
        p.addView(button("배터리 최적화에서 빼기") { batteryExempt() })
        root.addView(p)

        root.addView(button("로그아웃") {
            SmsService.stop(this); api.signOut(); AppLog.add(this, "로그아웃"); render()
        })
    }

    private fun hasPerm(p: String) = checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED

    private fun permName(p: String) = when (p) {
        Manifest.permission.SEND_SMS -> "SMS(문자)"
        Manifest.permission.READ_PHONE_STATE -> "전화"
        Manifest.permission.READ_CALL_LOG -> "통화 기록"
        Manifest.permission.READ_MEDIA_AUDIO, Manifest.permission.READ_EXTERNAL_STORAGE -> "음악·오디오(녹음 파일)"
        else -> "알림"
    }

    private fun askPerms() {
        val need = PERMS.filter { !hasPerm(it) }
        if (need.isEmpty()) { toast("필요한 권한이 모두 허용돼 있어요"); return }
        val p = getSharedPreferences("lms_ui", MODE_PRIVATE)
        // 이미 한 번 거절했고 다시 묻지 못하는 상태면 앱 설정 화면으로 바로 이동
        val blocked = p.getBoolean("asked", false) && need.none { shouldShowRequestPermissionRationale(it) }
        if (blocked) { openAppSettings(need); return }
        p.edit().putBoolean("asked", true).apply()
        requestPermissions(need.toTypedArray(), 1)
    }

    private fun openAppSettings(need: List<String>) {
        toast("설정 → 권한에서 ${need.joinToString(", ") { permName(it) }}을 허용해 주세요. 회색이면 오른쪽 위 ⋮ → '제한된 설정 허용'을 먼저 누르세요.")
        startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName")))
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        refresh()
    }

    private fun batteryExempt() {
        val pm = getSystemService(PowerManager::class.java)
        if (pm.isIgnoringBatteryOptimizations(packageName)) { toast("이미 배터리 최적화에서 빠져 있어요"); return }
        try {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
        } catch (e: Exception) {
            startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
    }

    private fun refresh() {
        if (!::status.isInitialized) return
        val missing = PERMS.filter { !hasPerm(it) }
        val battery = getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(packageName)
        val lines = mutableListOf<String>()
        if (!api.loggedIn) lines.add("● 로그인 전")
        else {
            lines.add(if (api.enabled && SmsService.running) "● 문자 발송 켜짐" else "○ 문자 발송 꺼짐")
            lines.add(if (api.callUpload && SmsService.running) "● 통화 녹음 정리 켜짐" else "○ 통화 녹음 정리 꺼짐")
            if (SmsService.lastError.isNotEmpty()) lines.add("⚠ ${SmsService.lastError}")
        }
        if (missing.isNotEmpty()) lines.add("⚠ 허용 안 된 권한: ${missing.joinToString(", ") { permName(it) }}")
        if (!battery) lines.add("⚠ 배터리 최적화 대상 (화면이 꺼지면 늦게 보낼 수 있어요)")
        status.text = lines.joinToString("\n")
        val good = api.loggedIn && api.enabled && SmsService.running && missing.isEmpty()
        status.background = GradientDrawable().apply { cornerRadius = dp(12).toFloat(); setColor(Color.parseColor(if (good) "#E7F6EE" else "#FFF4E5")) }
        status.gravity = Gravity.START
        refreshLog()
    }

    private fun refreshLog() {
        if (::logView.isInitialized) logView.text = AppLog.read(this).ifEmpty { "아직 기록이 없어요" }
    }

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_LONG).show()
}

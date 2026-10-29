package com.lazisnucollectorapp

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.lazisnucollectorapp.qr.QrImageScannerPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          add(QrImageScannerPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    loadReactNative(this)
  }

  /**
   * Channel yang dituju backend (`apps/backend/src/services/fcm.ts` mengirim
   * dengan channelId "lazisnu_default"). Tanpa channel ini Android memakai
   * channel cadangan, sehingga notifikasi "BA siap diunduh" tidak muncul
   * sebagai pop-up di atas layar.
   */
  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      return
    }
    val channel =
      NotificationChannel(
        NOTIFICATION_CHANNEL_ID,
        "Pemberitahuan",
        NotificationManager.IMPORTANCE_HIGH,
      ).apply {
        description = "Berita acara siap diunduh dan pengingat tugas"
      }
    getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
  }

  companion object {
    private const val NOTIFICATION_CHANNEL_ID = "lazisnu_default"
  }
}

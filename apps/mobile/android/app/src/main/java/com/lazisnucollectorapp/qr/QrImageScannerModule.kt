package com.lazisnucollectorapp.qr

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage

class QrImageScannerModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val REQUEST_PICK_QR_IMAGE = 7301
  }

  private var pendingPromise: Promise? = null

  private val activityEventListener: ActivityEventListener =
    object : BaseActivityEventListener() {
      override fun onActivityResult(
        activity: Activity,
        requestCode: Int,
        resultCode: Int,
        data: Intent?,
      ) {
        if (requestCode != REQUEST_PICK_QR_IMAGE) return

        val promise = pendingPromise ?: return
        pendingPromise = null

        val imageUri = data?.data
        if (resultCode != Activity.RESULT_OK || imageUri == null) {
          promise.resolve(null)
          return
        }

        try {
          val image = InputImage.fromFilePath(reactContext, imageUri)
          val options = BarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build()
          val scanner = BarcodeScanning.getClient(options)

          scanner.process(image)
            .addOnSuccessListener { barcodes ->
              val values = barcodes.mapNotNull { it.rawValue }.distinct()
              when {
                values.isEmpty() -> promise.reject(
                  "QR_IMAGE_NOT_FOUND",
                  "Tidak ditemukan QR pada gambar tersebut",
                )
                values.size > 1 -> promise.reject(
                  "QR_IMAGE_MULTIPLE",
                  "Gunakan gambar yang hanya berisi satu QR",
                )
                else -> promise.resolve(values.first())
              }
            }
            .addOnFailureListener { error ->
              promise.reject("QR_IMAGE_DECODE_FAILED", "Gagal membaca gambar QR", error)
            }
            .addOnCompleteListener {
              scanner.close()
            }
        } catch (error: Exception) {
          promise.reject("QR_IMAGE_INVALID", "Gambar tidak dapat dibuka", error)
        }
      }
    }

  init {
    reactContext.addActivityEventListener(activityEventListener)
  }

  override fun getName(): String = "QrImageScanner"

  @ReactMethod
  fun pickAndDecode(promise: Promise) {
    if (pendingPromise != null) {
      promise.reject("QR_IMAGE_BUSY", "Pemilih gambar sedang digunakan")
      return
    }

    val activity = currentActivity
    if (activity == null) {
      promise.reject("QR_IMAGE_NO_ACTIVITY", "Layar aplikasi belum siap")
      return
    }

    pendingPromise = promise
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "image/*"
    }
    activity.startActivityForResult(intent, REQUEST_PICK_QR_IMAGE)
  }
}

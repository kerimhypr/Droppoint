package dev.droppoint

import android.app.Activity
import android.os.Bundle
import android.content.Intent

/** Native Android share-sheet target. The Rust bridge consumes the URI/text. */
class ShareReceiverActivity : Activity() {
  override fun onCreate(state: Bundle?) { super.onCreate(state); handle(intent); finish() }
  private fun handle(intent: Intent) {
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)
    val uri = intent.getParcelableExtra<android.net.Uri>(Intent.EXTRA_STREAM)
    // TODO: call RustCore.sendClipboard(text) or RustCore.offerFile(uri)
  }
}


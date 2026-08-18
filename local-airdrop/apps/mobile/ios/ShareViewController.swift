import UIKit

/// Share Extension target. The containing app passes the local-share payload to Rust.
final class ShareViewController: UIViewController {
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem }
      .flatMap { $0.attachments ?? [] }.forEach { provider in
        // Register UTType.plainText / UTType.fileURL and call the Rust FFI here.
        _ = provider
      }
  }
}


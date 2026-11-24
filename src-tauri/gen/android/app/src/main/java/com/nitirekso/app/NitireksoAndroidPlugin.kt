package com.nitirekso.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.result.ActivityResult
import androidx.core.content.FileProvider
import androidx.documentfile.provider.DocumentFile
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.nio.ByteBuffer
import java.security.KeyStore
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@InvokeArg
class TreeUriArgs {
  lateinit var treeUri: String
}

@InvokeArg
class CopyImageArgs {
  lateinit var sourcePath: String
  lateinit var mimeType: String
}

@InvokeArg
class PrintHtmlArgs {
  lateinit var html: String
  lateinit var jobName: String
}

@InvokeArg
class EnsureLayoutArgs {
  lateinit var treeUri: String
  lateinit var deviceId: String
}

@InvokeArg
class WriteMetaArgs {
  lateinit var treeUri: String
  lateinit var contentB64: String
}

@InvokeArg
class ListRemoteOpArgs {
  lateinit var treeUri: String
  lateinit var localDeviceId: String
}

@InvokeArg
class ReadOpLinesArgs {
  lateinit var treeUri: String
  lateinit var deviceId: String
  lateinit var fileName: String
  var fromLine: Int = 0
}

@InvokeArg
class AppendOpLinesArgs {
  lateinit var treeUri: String
  lateinit var deviceId: String
  lateinit var dateStr: String
  var maxFileBytes: Long = 1048576L
  var lines: List<String> = emptyList()
}

@InvokeArg
class MediaFileArgs {
  lateinit var treeUri: String
  lateinit var fileName: String
}

@InvokeArg
class WriteMediaArgs {
  lateinit var treeUri: String
  lateinit var fileName: String
  lateinit var contentB64: String
}

@InvokeArg
class WriteSnapshotArgs {
  lateinit var treeUri: String
  lateinit var snapshotFolderName: String
  lateinit var sourceDirPath: String
}

@InvokeArg
class CopyTreeArgs {
  lateinit var treeUri: String
  lateinit var destDirPath: String
}

@InvokeArg
class MuxArgs {
  lateinit var videoPath: String
  var audioPath: String? = null
  lateinit var outputPath: String
}

@InvokeArg
class SaveMediaStoreArgs {
  lateinit var sourcePath: String
  lateinit var fileName: String
  lateinit var mimeType: String
  lateinit var collection: String
}

@InvokeArg
class ShareFileArgs {
  lateinit var sourcePath: String
  lateinit var mimeType: String
  lateinit var title: String
}

@InvokeArg
class WrapSecretArgs {
  lateinit var plaintextB64: String
}

@InvokeArg
class UnwrapSecretArgs {
  lateinit var ciphertextB64: String
}

@TauriPlugin
class NitireksoAndroidPlugin(private val activity: Activity) : Plugin(activity) {
  private val ioExecutor = Executors.newCachedThreadPool()

  companion object {
    private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    private const val KEY_ALIAS = "nitirekso_device_master_key"
    private const val GCM_TAG_BITS = 128
    private const val GCM_IV_BYTES = 12
  }

  private fun isIgnoredSyncTempName(name: String): Boolean {
    return name.startsWith(".syncthing.") ||
      name.startsWith("~syncthing~") ||
      name.endsWith(".tmp") ||
      name.startsWith(".")
  }

  private fun rootDoc(treeUriStr: String): DocumentFile {
    val uri = Uri.parse(treeUriStr)
    return DocumentFile.fromTreeUri(activity, uri)
      ?: throw IllegalStateException("Akses folder SAF tidak valid atau izin telah dicabut.")
  }

  private fun getOrCreateSubDir(parent: DocumentFile, name: String): DocumentFile {
    val existing = parent.findFile(name)
    if (existing != null && existing.isDirectory) {
      return existing
    }
    return parent.createDirectory(name)
      ?: throw IllegalStateException("Gagal membuat subfolder SAF '$name'.")
  }

  private fun writeDocBytes(parent: DocumentFile, fileName: String, mimeType: String, bytes: ByteArray) {
    val existing = parent.findFile(fileName)
    val target = existing ?: parent.createFile(mimeType, fileName)
      ?: throw IllegalStateException("Gagal membuat berkas SAF '$fileName'.")
    val mode = if (existing != null) "wt" else "w"
    val out = activity.contentResolver.openOutputStream(target.uri, mode)
      ?: activity.contentResolver.openOutputStream(target.uri)
      ?: throw IllegalStateException("Gagal membuka stream tulis SAF untuk '$fileName'.")
    out.use {
      it.write(bytes)
      it.flush()
    }
  }

  private fun readDocBytes(file: DocumentFile): ByteArray {
    val input = activity.contentResolver.openInputStream(file.uri)
      ?: throw IllegalStateException("Gagal membuka stream baca SAF untuk '${file.name}'.")
    return input.use { it.readBytes() }
  }

  @Command
  fun pickDirectoryTree(invoke: Invoke) {
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).apply {
      addFlags(
        Intent.FLAG_GRANT_READ_URI_PERMISSION or
          Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
          Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or
          Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
      )
    }
    startActivityForResult(invoke, intent, "onDirectoryPicked")
  }

  @ActivityCallback
  fun onDirectoryPicked(invoke: Invoke, result: ActivityResult) {
    if (result.resultCode != Activity.RESULT_OK) {
      val ret = JSObject()
      ret.put("uri", null)
      ret.put("displayName", null)
      invoke.resolve(ret)
      return
    }
    val uri = result.data?.data
    if (uri == null) {
      val ret = JSObject()
      ret.put("uri", null)
      ret.put("displayName", null)
      invoke.resolve(ret)
      return
    }
    try {
      val takeFlags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
      activity.contentResolver.takePersistableUriPermission(uri, takeFlags)
      val doc = DocumentFile.fromTreeUri(activity, uri)
      val ret = JSObject()
      ret.put("uri", uri.toString())
      ret.put("displayName", doc?.name)
      invoke.resolve(ret)
    } catch (e: Exception) {
      invoke.reject("Gagal menyimpan izin folder SAF: ${e.message}", e)
    }
  }

  @Command
  fun getTreeDisplayName(invoke: Invoke) {
    val args = invoke.parseArgs(TreeUriArgs::class.java)
    ioExecutor.execute {
      try {
        val doc = DocumentFile.fromTreeUri(activity, Uri.parse(args.treeUri))
        val ret = JSObject()
        ret.put("displayName", doc?.name)
        invoke.resolve(ret)
      } catch (_: Exception) {
        val ret = JSObject()
        ret.put("displayName", null)
        invoke.resolve(ret)
      }
    }
  }

  @Command
  fun safEnsureLayout(invoke: Invoke) {
    val args = invoke.parseArgs(EnsureLayoutArgs::class.java)
    ioExecutor.execute {
      try {
        val root = rootDoc(args.treeUri)
        val opsDir = getOrCreateSubDir(root, "ops")
        getOrCreateSubDir(opsDir, args.deviceId)
        getOrCreateSubDir(root, "media")
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "safEnsureLayout gagal", e)
      }
    }
  }

  @Command
  fun safReadMeta(invoke: Invoke) {
    val args = invoke.parseArgs(TreeUriArgs::class.java)
    ioExecutor.execute {
      try {
        val root = rootDoc(args.treeUri)
        val metaFile = root.findFile("vault.json")
        val ret = JSObject()
        if (metaFile == null || !metaFile.isFile) {
          ret.put("contentB64", null)
        } else {
          val bytes = readDocBytes(metaFile)
          ret.put("contentB64", Base64.encodeToString(bytes, Base64.NO_WRAP))
        }
        invoke.resolve(ret)
      } catch (e: Exception) {
        invoke.reject(e.message ?: "safReadMeta gagal", e)
      }
    }
  }

  @Command
  fun safWriteMeta(invoke: Invoke) {
    val args = invoke.parseArgs(WriteMetaArgs::class.java)
    ioExecutor.execute {
      try {
        val root = rootDoc(args.treeUri)
        val bytes = Base64.decode(args.contentB64, Base64.DEFAULT)
        writeDocBytes(root, "vault.json", "application/json", bytes)
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "safWriteMeta gagal", e)
      }
    }
  }

  @Command
  fun safListRemoteOpFiles(invoke: Invoke) {
    val args = invoke.parseArgs(ListRemoteOpArgs::class.java)
    ioExecutor.execute {
      try {
        val root = rootDoc(args.treeUri)
        val opsDir = root.findFile("ops")
        val filesArr = JSArray()
        if (opsDir != null && opsDir.isDirectory) {
          for (devDir in opsDir.listFiles()) {
            if (!devDir.isDirectory) continue
            val devName = devDir.name ?: continue
            if (isIgnoredSyncTempName(devName) || devName == args.localDeviceId) continue
            for (f in devDir.listFiles()) {
              if (!f.isFile) continue
              val fname = f.name ?: continue
              if (isIgnoredSyncTempName(fname) || !fname.endsWith(".jsonl")) continue
              val item = JSObject()
              item.put("deviceId", devName)
              item.put("fileName", fname)
              filesArr.put(item)
            }
          }
        }
        val ret = JSObject()
        ret.put("files", filesArr)
        invoke.resolve(ret)
      } catch (e: Exception) {
        invoke.reject(e.message ?: "safListRemoteOpFiles gagal", e)
      }
    }
  }

  @Command
  fun safReadOpLines(invoke: Invoke) {
    val args = invoke.parseArgs(ReadOpLinesArgs::class.java)
    ioExecutor.execute {
      try {
        val ret = JSObject()
        val linesArr = JSArray()
        if (isIgnoredSyncTempName(args.fileName)) {
          ret.put("lines", linesArr)
          ret.put("totalSeen", args.fromLine)
          invoke.resolve(ret)
          return@execute
        }

        val root = rootDoc(args.treeUri)
        val targetFile = root.findFile("ops")?.findFile(args.deviceId)?.findFile(args.fileName)
        if (targetFile == null || !targetFile.isFile) {
          ret.put("lines", linesArr)
          ret.put("totalSeen", args.fromLine)
          invoke.resolve(ret)
          return@execute
        }

        var totalSeen = 0
        val input = activity.contentResolver.openInputStream(targetFile.uri)
          ?: throw IllegalStateException("Gagal membuka op-log SAF '${args.fileName}'.")
        BufferedReader(InputStreamReader(input, Charsets.UTF_8)).use { reader ->
          while (true) {
            val line = reader.readLine() ?: break
            if (totalSeen >= args.fromLine) {
              val trimmed = line.trim()
              if (trimmed.isNotEmpty()) {
                val entry = JSObject()
                entry.put("index", totalSeen)
                entry.put("line", trimmed)
                linesArr.put(entry)
              }
            }
            totalSeen += 1
          }
        }
        ret.put("lines", linesArr)
        ret.put("totalSeen", totalSeen)
        invoke.resolve(ret)
      } catch (e: Exception) {
        invoke.reject(e.message ?: "safReadOpLines gagal", e)
      }
    }
  }

  @Command
  fun safAppendOpLines(invoke: Invoke) {
    val args = invoke.parseArgs(AppendOpLinesArgs::class.java)
    if (args.lines.isEmpty()) {
      invoke.resolve(JSObject())
      return
    }
    ioExecutor.execute {
      try {
        val root = rootDoc(args.treeUri)
        val opsDir = getOrCreateSubDir(root, "ops")
        val deviceDir = getOrCreateSubDir(opsDir, args.deviceId)
        getOrCreateSubDir(root, "media")

        val prefix = "${args.dateStr}-"
        var maxSeq = 1
        var latestDoc: DocumentFile? = null
        for (entry in deviceDir.listFiles()) {
          val fname = entry.name ?: continue
          if (isIgnoredSyncTempName(fname) || !fname.endsWith(".jsonl")) continue
          if (fname.startsWith(prefix)) {
            val seqStr = fname.removePrefix(prefix).removeSuffix(".jsonl")
            val seq = seqStr.toIntOrNull()
            if (seq != null && seq >= maxSeq) {
              maxSeq = seq
              latestDoc = entry
            }
          }
        }

        val targetSeq = if (latestDoc != null && latestDoc.length() >= args.maxFileBytes) {
          maxSeq + 1
        } else {
          maxSeq
        }
        val targetName = String.format("%s-%03d.jsonl", args.dateStr, targetSeq)
        val existingTarget = deviceDir.findFile(targetName)
        val targetDoc = existingTarget ?: deviceDir.createFile("application/x-ndjson", targetName)
          ?: throw IllegalStateException("Gagal membuat berkas op-log '$targetName'.")

        val payloadBytes = buildString {
          for (l in args.lines) {
            append(l)
            append('\n')
          }
        }.toByteArray(Charsets.UTF_8)

        val out = activity.contentResolver.openOutputStream(targetDoc.uri, "wa")
          ?: activity.contentResolver.openOutputStream(targetDoc.uri, "w")
          ?: throw IllegalStateException("Gagal membuka stream append op-log '$targetName'.")
        out.use {
          it.write(payloadBytes)
          it.flush()
        }
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "safAppendOpLines gagal", e)
      }
    }
  }

  @Command
  fun safHasMedia(invoke: Invoke) {
    val args = invoke.parseArgs(MediaFileArgs::class.java)
    ioExecutor.execute {
      try {
        val ret = JSObject()
        if (isIgnoredSyncTempName(args.fileName)) {
          ret.put("exists", false)
        } else {
          val mediaFile = rootDoc(args.treeUri).findFile("media")?.findFile(args.fileName)
          ret.put("exists", mediaFile != null && mediaFile.isFile)
        }
        invoke.resolve(ret)
      } catch (_: Exception) {
        val ret = JSObject()
        ret.put("exists", false)
        invoke.resolve(ret)
      }
    }
  }

  @Command
  fun safWriteMedia(invoke: Invoke) {
    val args = invoke.parseArgs(WriteMediaArgs::class.java)
    ioExecutor.execute {
      try {
        if (isIgnoredSyncTempName(args.fileName)) {
          invoke.reject("Nama berkas media tidak valid.")
          return@execute
        }
        val root = rootDoc(args.treeUri)
        val mediaDir = getOrCreateSubDir(root, "media")
        if (mediaDir.findFile(args.fileName) == null) {
          val bytes = Base64.decode(args.contentB64, Base64.DEFAULT)
          writeDocBytes(mediaDir, args.fileName, "application/octet-stream", bytes)
        }
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject(e.message ?: "safWriteMedia gagal", e)
      }
    }
  }

  @Command
  fun safReadMedia(invoke: Invoke) {
    val args = invoke.parseArgs(MediaFileArgs::class.java)
    ioExecutor.execute {
      try {
        val ret = JSObject()
        if (isIgnoredSyncTempName(args.fileName)) {
          ret.put("contentB64", null)
          invoke.resolve(ret)
          return@execute
        }
        val mediaFile = rootDoc(args.treeUri).findFile("media")?.findFile(args.fileName)
        if (mediaFile == null || !mediaFile.isFile) {
          ret.put("contentB64", null)
        } else {
          val bytes = readDocBytes(mediaFile)
          ret.put("contentB64", Base64.encodeToString(bytes, Base64.NO_WRAP))
        }
        invoke.resolve(ret)
      } catch (e: Exception) {
        invoke.reject(e.message ?: "safReadMedia gagal", e)
      }
    }
  }

  private fun copyLocalDirToSaf(localDir: File, safDir: DocumentFile): Pair<Int, Int> {
    var files = 0
    var bytes = 0
    val children = localDir.listFiles() ?: return Pair(0, 0)
    for (child in children) {
      if (child.isDirectory) {
        val subSaf = getOrCreateSubDir(safDir, child.name)
        val (f, b) = copyLocalDirToSaf(child, subSaf)
        files += f
        bytes += b
      } else if (child.isFile) {
        val data = child.readBytes()
        writeDocBytes(safDir, child.name, "application/octet-stream", data)
        files += 1
        bytes += data.size
      }
    }
    return Pair(files, bytes)
  }

  @Command
  fun safWriteSnapshotDir(invoke: Invoke) {
    val args = invoke.parseArgs(WriteSnapshotArgs::class.java)
    ioExecutor.execute {
      try {
        val srcDir = File(args.sourceDirPath)
        if (!srcDir.exists() || !srcDir.isDirectory) {
          invoke.reject("Direktori staging snapshot tidak ditemukan.")
          return@execute
        }
        val root = rootDoc(args.treeUri)
        val targetFolder = getOrCreateSubDir(root, args.snapshotFolderName)
        val (filesWritten, bytesWritten) = copyLocalDirToSaf(srcDir, targetFolder)
        val ret = JSObject()
        ret.put("filesWritten", filesWritten)
        ret.put("bytesWritten", bytesWritten)
        invoke.resolve(ret)
      } catch (e: Exception) {
        invoke.reject(e.message ?: "safWriteSnapshotDir gagal", e)
      }
    }
  }

  private fun copySafDirToLocal(safDir: DocumentFile, localDir: File): Int {
    if (!localDir.exists()) localDir.mkdirs()
    var count = 0
    for (entry in safDir.listFiles()) {
      val name = entry.name ?: continue
      if (entry.isDirectory) {
        count += copySafDirToLocal(entry, File(localDir, name))
      } else if (entry.isFile) {
        val data = readDocBytes(entry)
        File(localDir, name).writeBytes(data)
        count += 1
      }
    }
    return count
  }

  @Command
  fun safCopyTreeToDir(invoke: Invoke) {
    val args = invoke.parseArgs(CopyTreeArgs::class.java)
    ioExecutor.execute {
      try {
        val root = rootDoc(args.treeUri)
        val hasDirectArchive = root.listFiles().any {
          val n = it.name ?: ""
          it.isFile && (n.endsWith(".db") || n.endsWith(".sqlite") || (n.startsWith("trading-journal-") && n.endsWith(".json")))
        }
        val sourceDoc = if (hasDirectArchive) {
          root
        } else {
          root.listFiles()
            .filter { it.isDirectory && (it.name ?: "").startsWith("nitirekso-snapshot-") }
            .maxByOrNull { it.name ?: "" }
            ?: root
        }

        val destDir = File(args.destDirPath)
        val copied = copySafDirToLocal(sourceDoc, destDir)
        val ret = JSObject()
        ret.put("filesCopied", copied)
        ret.put("displayName", sourceDoc.name)
        invoke.resolve(ret)
      } catch (e: Exception) {
        invoke.reject(e.message ?: "safCopyTreeToDir gagal", e)
      }
    }
  }

  @Command
  fun muxAudioVideoMp4(invoke: Invoke) {
    val args = invoke.parseArgs(MuxArgs::class.java)
    ioExecutor.execute {
      val videoExtractor = MediaExtractor()
      val audioExtractor = MediaExtractor()
      var muxer: MediaMuxer? = null
      try {
        videoExtractor.setDataSource(args.videoPath)
        var videoTrackIdx = -1
        var videoFormat: MediaFormat? = null
        var videoDurationUs = 0L

        for (i in 0 until videoExtractor.trackCount) {
          val fmt = videoExtractor.getTrackFormat(i)
          val mime = fmt.getString(MediaFormat.KEY_MIME) ?: ""
          if (mime.startsWith("video/")) {
            videoTrackIdx = i
            videoFormat = fmt
            if (fmt.containsKey(MediaFormat.KEY_DURATION)) {
              videoDurationUs = fmt.getLong(MediaFormat.KEY_DURATION)
            }
            break
          }
        }
        if (videoTrackIdx < 0 || videoFormat == null) {
          invoke.reject("Trek video tidak ditemukan pada berkas MP4.")
          return@execute
        }

        var audioTrackIdx = -1
        var audioFormat: MediaFormat? = null
        val audioPath = args.audioPath
        if (!audioPath.isNullOrBlank() && File(audioPath).exists()) {
          try {
            audioExtractor.setDataSource(audioPath)
            for (i in 0 until audioExtractor.trackCount) {
              val fmt = audioExtractor.getTrackFormat(i)
              val mime = fmt.getString(MediaFormat.KEY_MIME) ?: ""
              if (mime.startsWith("audio/")) {
                audioTrackIdx = i
                audioFormat = fmt
                break
              }
            }
          } catch (_: Exception) {
            audioTrackIdx = -1
          }
        }

        muxer = MediaMuxer(args.outputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
        val outVideoIdx = muxer.addTrack(videoFormat)
        val outAudioIdx = if (audioTrackIdx >= 0 && audioFormat != null) muxer.addTrack(audioFormat) else -1
        muxer.start()

        val buffer = ByteBuffer.allocate(1024 * 1024)
        val info = MediaCodec.BufferInfo()

        videoExtractor.selectTrack(videoTrackIdx)
        var maxVideoPtsUs = 0L
        while (true) {
          val sampleSize = videoExtractor.readSampleData(buffer, 0)
          if (sampleSize < 0) break
          info.offset = 0
          info.size = sampleSize
          info.presentationTimeUs = videoExtractor.sampleTime
          @Suppress("DEPRECATION")
          info.flags = videoExtractor.sampleFlags
          if (info.presentationTimeUs > maxVideoPtsUs) {
            maxVideoPtsUs = info.presentationTimeUs
          }
          muxer.writeSampleData(outVideoIdx, buffer, info)
          videoExtractor.advance()
        }

        val targetDurationUs = maxOf(videoDurationUs, maxVideoPtsUs)
        if (outAudioIdx >= 0 && targetDurationUs > 0L) {
          audioExtractor.selectTrack(audioTrackIdx)
          var loopOffsetUs = 0L
          var lastAudioPtsUs = 0L
          while (loopOffsetUs < targetDurationUs) {
            val sampleSize = audioExtractor.readSampleData(buffer, 0)
            if (sampleSize < 0) {
              if (lastAudioPtsUs <= 0L) break
              loopOffsetUs += lastAudioPtsUs + 23_220L
              if (loopOffsetUs >= targetDurationUs) break
              audioExtractor.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC)
              lastAudioPtsUs = 0L
              continue
            }
            val samplePts = audioExtractor.sampleTime
            val absPts = loopOffsetUs + samplePts
            if (absPts > targetDurationUs) break
            lastAudioPtsUs = samplePts
            info.offset = 0
            info.size = sampleSize
            info.presentationTimeUs = absPts
            @Suppress("DEPRECATION")
            info.flags = audioExtractor.sampleFlags
            muxer.writeSampleData(outAudioIdx, buffer, info)
            audioExtractor.advance()
          }
        }

        muxer.stop()
        invoke.resolve(JSObject())
      } catch (e: Exception) {
        invoke.reject("MediaMuxer gagal: ${e.message}", e)
      } finally {
        try { muxer?.release() } catch (_: Exception) {}
        try { videoExtractor.release() } catch (_: Exception) {}
        try { audioExtractor.release() } catch (_: Exception) {}
      }
    }
  }

  @Command
  fun saveToMediaStore(invoke: Invoke) {
    val args = invoke.parseArgs(SaveMediaStoreArgs::class.java)
    ioExecutor.execute {
      try {
        val srcFile = File(args.sourcePath)
        if (!srcFile.exists()) {
          invoke.reject("Berkas sumber tidak ditemukan.")
          return@execute
        }

        val (collectionUri, relPath) = when (args.collection) {
          "videos" -> Pair(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, "${Environment.DIRECTORY_MOVIES}/nitirekso")
          "images" -> Pair(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, "${Environment.DIRECTORY_PICTURES}/nitirekso")
          else -> Pair(MediaStore.Downloads.EXTERNAL_CONTENT_URI, "${Environment.DIRECTORY_DOWNLOADS}/nitirekso")
        }

        val values = ContentValues().apply {
          put(MediaStore.MediaColumns.DISPLAY_NAME, args.fileName)
          put(MediaStore.MediaColumns.MIME_TYPE, args.mimeType)
          put(MediaStore.MediaColumns.RELATIVE_PATH, relPath)
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            put(MediaStore.MediaColumns.IS_PENDING, 1)
          }
        }

        val resolver = activity.contentResolver
        val itemUri = resolver.insert(collectionUri, values)
          ?: throw IllegalStateException("Gagal membuat entri MediaStore.")

        try {
          resolver.openOutputStream(itemUri)?.use { out ->
            srcFile.inputStream().use { inp -> inp.copyTo(out) }
            out.flush()
          } ?: throw IllegalStateException("Gagal membuka stream tulis MediaStore.")

          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val done = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
            resolver.update(itemUri, done, null, null)
          }
        } catch (e: Exception) {
          resolver.delete(itemUri, null, null)
          throw e
        }

        val ret = JSObject()
        ret.put("savedLocation", "$relPath/${args.fileName}")
        invoke.resolve(ret)
      } catch (e: Exception) {
        invoke.reject(e.message ?: "saveToMediaStore gagal", e)
      }
    }
  }

  @Command
  fun shareFile(invoke: Invoke) {
    val args = invoke.parseArgs(ShareFileArgs::class.java)
    try {
      val srcFile = File(args.sourcePath)
      if (!srcFile.exists()) {
        invoke.reject("Berkas yang akan dibagikan tidak ditemukan.")
        return
      }
      val sharedDir = File(activity.cacheDir, "shared").apply { mkdirs() }
      val shareTarget = File(sharedDir, srcFile.name)
      if (srcFile.canonicalPath != shareTarget.canonicalPath) {
        srcFile.copyTo(shareTarget, overwrite = true)
      }

      val authority = "${activity.packageName}.fileprovider"
      val contentUri = FileProvider.getUriForFile(activity, authority, shareTarget)
      val sendIntent = Intent(Intent.ACTION_SEND).apply {
        type = args.mimeType
        putExtra(Intent.EXTRA_STREAM, contentUri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(sendIntent, args.title).apply {
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      activity.startActivity(chooser)
      invoke.resolve(JSObject())
    } catch (e: Exception) {
      invoke.reject("Gagal membuka Share Sheet: ${e.message}", e)
    }
  }

  @Command
  fun copyImageToClipboard(invoke: Invoke) {
    val args = invoke.parseArgs(CopyImageArgs::class.java)
    try {
      val srcFile = File(args.sourcePath)
      if (!srcFile.exists()) {
        invoke.reject("Berkas gambar untuk disalin tidak ditemukan.")
        return
      }
      val sharedDir = File(activity.cacheDir, "shared").apply { mkdirs() }
      val clipTarget = File(sharedDir, srcFile.name)
      if (srcFile.canonicalPath != clipTarget.canonicalPath) {
        srcFile.copyTo(clipTarget, overwrite = true)
      }
      val authority = "${activity.packageName}.fileprovider"
      val contentUri = FileProvider.getUriForFile(activity, authority, clipTarget)
      activity.runOnUiThread {
        try {
          val clipboard = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
          val clip = ClipData.newUri(activity.contentResolver, "nitirekso Share Card", contentUri)
          clipboard.setPrimaryClip(clip)
          invoke.resolve(JSObject())
        } catch (e: Exception) {
          invoke.reject("Gagal menyalin gambar ke clipboard: ${e.message}", e)
        }
      }
    } catch (e: Exception) {
      invoke.reject("Gagal menyiapkan gambar untuk clipboard: ${e.message}", e)
    }
  }

  private var activePrintWebView: WebView? = null

  @Command
  fun printHtmlDocument(invoke: Invoke) {
    val args = invoke.parseArgs(PrintHtmlArgs::class.java)
    activity.runOnUiThread {
      try {
        val webView = WebView(activity)
        activePrintWebView = webView
        webView.webViewClient = object : WebViewClient() {
          override fun onPageFinished(view: WebView, url: String?) {
            try {
              val printManager = activity.getSystemService(Context.PRINT_SERVICE) as PrintManager
              val adapter = view.createPrintDocumentAdapter(args.jobName)
              printManager.print(args.jobName, adapter, PrintAttributes.Builder().build())
              invoke.resolve(JSObject())
            } catch (e: Exception) {
              invoke.reject("Gagal membuka dialog Print/PDF Android: ${e.message}", e)
            } finally {
              activePrintWebView = null
            }
          }
        }
        webView.loadDataWithBaseURL(null, args.html, "text/html", "UTF-8", null)
      } catch (e: Exception) {
        activePrintWebView = null
        invoke.reject("Gagal menyiapkan dokumen Print/PDF: ${e.message}", e)
      }
    }
  }

  private fun getOrCreateKeystoreSecretKey(): SecretKey {
    val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
    val existing = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
    if (existing != null) {
      return existing.secretKey
    }
    val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
    val spec = KeyGenParameterSpec.Builder(
      KEY_ALIAS,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setKeySize(256)
      .build()
    keyGenerator.init(spec)
    return keyGenerator.generateKey()
  }

  @Command
  fun wrapSecret(invoke: Invoke) {
    val args = invoke.parseArgs(WrapSecretArgs::class.java)
    ioExecutor.execute {
      try {
        val plaintext = Base64.decode(args.plaintextB64, Base64.DEFAULT)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKeystoreSecretKey())
        val iv = cipher.iv
        val ciphertext = cipher.doFinal(plaintext)
        val combined = ByteArray(iv.size + ciphertext.size)
        System.arraycopy(iv, 0, combined, 0, iv.size)
        System.arraycopy(ciphertext, 0, combined, iv.size, ciphertext.size)
        val ret = JSObject()
        ret.put("ciphertextB64", Base64.encodeToString(combined, Base64.NO_WRAP))
        invoke.resolve(ret)
      } catch (e: Exception) {
        invoke.reject("AndroidKeyStore wrap gagal: ${e.message}", e)
      }
    }
  }

  @Command
  fun unwrapSecret(invoke: Invoke) {
    val args = invoke.parseArgs(UnwrapSecretArgs::class.java)
    ioExecutor.execute {
      try {
        val raw = Base64.decode(args.ciphertextB64, Base64.DEFAULT)
        if (raw.size <= GCM_IV_BYTES) {
          invoke.reject("Ciphertext AndroidKeyStore terlalu pendek.")
          return@execute
        }
        val iv = raw.copyOfRange(0, GCM_IV_BYTES)
        val ciphertext = raw.copyOfRange(GCM_IV_BYTES, raw.size)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
          Cipher.DECRYPT_MODE,
          getOrCreateKeystoreSecretKey(),
          GCMParameterSpec(GCM_TAG_BITS, iv)
        )
        val plaintext = cipher.doFinal(ciphertext)
        val ret = JSObject()
        ret.put("plaintextB64", Base64.encodeToString(plaintext, Base64.NO_WRAP))
        invoke.resolve(ret)
      } catch (e: Exception) {
        invoke.reject("AndroidKeyStore unwrap gagal: ${e.message}", e)
      }
    }
  }
}

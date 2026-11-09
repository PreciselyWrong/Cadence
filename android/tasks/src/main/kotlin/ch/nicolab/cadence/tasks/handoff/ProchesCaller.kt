package ch.nicolab.cadence.tasks.handoff

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import ch.nicolab.cadence.domain.handoff.ProchesHandoff
import java.security.MessageDigest

/** Vérifie que l'appelant du fournisseur est Proches, signé par la clé attendue. */
internal object ProchesCaller {
    fun isAuthorized(context: Context, callingPackage: String?): Boolean {
        if (callingPackage != ProchesHandoff.PACKAGE) return false
        return ProchesHandoff.allSignersAllowed(signerDigests(context, callingPackage))
    }

    private fun signerDigests(context: Context, packageName: String): List<String> = try {
        val packages = context.packageManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val info = packages.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            val signers = info.signingInfo?.apkContentsSigners ?: emptyArray()
            signers.map(::sha256Hex)
        } else {
            @Suppress("DEPRECATION")
            val info = packages.getPackageInfo(packageName, PackageManager.GET_SIGNATURES)
            @Suppress("DEPRECATION")
            val signatures = info.signatures ?: emptyArray()
            signatures.map(::sha256Hex)
        }
    } catch (_: PackageManager.NameNotFoundException) {
        emptyList()
    }

    private fun sha256Hex(signature: android.content.pm.Signature): String =
        MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) }
}

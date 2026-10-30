package ch.nicolab.cadence

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import ch.nicolab.cadence.ui.components.PrimaryAction
import ch.nicolab.cadence.ui.theme.CadenceTheme
import ch.nicolab.cadence.ui.theme.Space
import ch.nicolab.cadence.ui.theme.cadence

class HealthConnectRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CadenceTheme {
                Column(
                    Modifier.fillMaxSize().background(cadence.background).safeDrawingPadding().padding(Space.gutter),
                    verticalArrangement = Arrangement.Center,
                ) {
                    Text(
                        stringResource(R.string.health_connect_privacy_title),
                        style = MaterialTheme.typography.headlineMedium,
                        color = cadence.ink,
                    )
                    Spacer(Modifier.height(Space.lg))
                    Text(
                        stringResource(R.string.health_connect_privacy_body),
                        style = MaterialTheme.typography.bodyLarge,
                        color = cadence.inkMuted,
                    )
                    Spacer(Modifier.height(Space.xxl))
                    PrimaryAction(
                        stringResource(R.string.health_connect_privacy_close),
                        Modifier.fillMaxWidth(),
                    ) { finish() }
                }
            }
        }
    }
}

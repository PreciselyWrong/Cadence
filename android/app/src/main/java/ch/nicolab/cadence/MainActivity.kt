package ch.nicolab.cadence

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import ch.nicolab.cadence.designsystem.theme.CadenceTheme
import ch.nicolab.cadence.tasks.widget.EXTRA_OPEN_TASK_UID

class MainActivity : ComponentActivity() {
    companion object { const val EXTRA_EDIT_HABIT_ID = "edit_habit_id" }
    private val viewModel by viewModels<MainViewModel> { MainViewModelFactory(application as CadenceApp) }

    override fun onStart() {
        super.onStart()
        viewModel.onAppVisible()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CadenceTheme {
                CadenceAppScreen(viewModel, intent.getStringExtra(EXTRA_EDIT_HABIT_ID), intent.getStringExtra(EXTRA_OPEN_TASK_UID))
            }
        }
    }
}

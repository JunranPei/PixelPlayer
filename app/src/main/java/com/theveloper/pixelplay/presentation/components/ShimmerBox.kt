package com.theveloper.pixelplay.presentation.components

import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush

@Composable
fun ShimmerBox(modifier: Modifier = Modifier) {
    // Use MaterialTheme colors for proper dark/light mode support
    val baseColor = MaterialTheme.colorScheme.surfaceContainerHigh
    val highlightColor = MaterialTheme.colorScheme.surfaceContainerHighest
    
    val shimmerColors = listOf(
        baseColor,
        highlightColor,
        baseColor,
    )

    val isScreenActive = LocalScreenActive.current
    val brush = if (isScreenActive) {
        val transition = rememberInfiniteTransition(label = "shimmer")
        val translateAnim = transition.animateFloat(
            initialValue = 0f,
            targetValue = 1000f,
            animationSpec = infiniteRepeatable(
                animation = tween(durationMillis = 1000, delayMillis = 200),
            ),
            label = "shimmerTranslate"
        )
        Brush.linearGradient(
            colors = shimmerColors,
            start = Offset.Zero,
            end = Offset(x = translateAnim.value, y = translateAnim.value)
        )
    } else {
        Brush.linearGradient(
            colors = listOf(baseColor, baseColor),
            start = Offset.Zero,
            end = Offset.Zero
        )
    }

    Box(
        modifier = modifier.background(brush = brush)
    )
}
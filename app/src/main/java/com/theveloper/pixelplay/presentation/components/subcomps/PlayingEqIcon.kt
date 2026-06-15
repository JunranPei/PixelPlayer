package com.theveloper.pixelplay.presentation.components.subcomps

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import kotlin.math.PI
import kotlin.math.sin

@Composable
fun PlayingEqIcon(
    modifier: Modifier = Modifier,
    color: Color,
    isPlaying: Boolean = true,
    bars: Int = 3,
    minHeightFraction: Float = 0.28f,
    maxHeightFraction: Float = 1.0f,
    phaseDurationMillis: Int = 3600,
    wanderDurationMillis: Int = 12000,
    gapFraction: Float = 0.30f
) {
    val fullRotation = (2f * PI).toFloat()
    
    // 使用系统级统一动画心跳，避免手写两个 LaunchedEffect 协程循环造成的 CPU 调度开销
    val infiniteTransition = rememberInfiniteTransition(label = "PlayingEqIconTransition")

    val phaseState = infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = fullRotation,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = phaseDurationMillis, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "phase"
    )

    val wanderState = infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = fullRotation,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = wanderDurationMillis, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "wander"
    )

    // 状态从播放变暂停时的平滑动画（1 -> 0）
    val activity by animateFloatAsState(
        targetValue = if (isPlaying) 1f else 0f,
        animationSpec = tween(durationMillis = 240, easing = FastOutSlowInEasing),
        label = "activity"
    )

    val speeds = remember(bars) { List(bars) { (it + 1).toFloat() } }
    val shifts = remember(bars) { List(bars) { i -> i * 0.9f } }

    // 关键：在 Canvas 的 modifier 上应用 .graphicsLayer() 产生独立的硬件绘制图层（RenderNode）
    // 这能在高频重绘时进行层隔离，彻底防止 Canvas 的 invalidate 向上级和 parent 传导，大幅降低能耗。
    Canvas(modifier = modifier.graphicsLayer { clip = true }) {
        // 关键：当处于非播放状态时，直接使用静态值，绝对不访问 phaseState.value 和 wanderState.value！
        // 从而断开 Compose 对它们的读取追踪，这样当它们在后台继续循环时，本 Canvas 绝对不会触发重绘。
        val phase = if (isPlaying) phaseState.value else 0f
        val wander = if (isPlaying) wanderState.value else 0f
        val w = size.width
        val h = size.height

        val tentativeBarW = w / (bars + (bars - 1) * (1f + gapFraction))
        val gap = tentativeBarW * gapFraction
        val barW = tentativeBarW
        val corner = CornerRadius(barW / 2f, barW / 2f)

        repeat(bars) { i ->
            val slowShift = 0.6f * sin(wander + i * 0.4f)
            val slowAmp   = 0.85f + 0.15f * sin(wander * 0.5f + 1.1f + i * 0.3f)

            val v = (sin(phase * speeds[i] + shifts[i] + slowShift) * slowAmp + 1f) * 0.5f
            val eased = v * v * (3 - 2 * v)

            val fracBars = minHeightFraction + (maxHeightFraction - minHeightFraction) * eased
            val barH = h * fracBars
            val dotH = barW
            val blendedH = dotH + (barH - dotH) * activity

            val top = (h - blendedH) / 2f
            val left = i * (barW + gap)

            drawRoundRect(
                color = color,
                topLeft = Offset(left, top),
                size = Size(barW, blendedH),
                cornerRadius = corner
            )
        }
    }
}

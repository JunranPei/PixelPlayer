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
    // 状态从暂停变播放或播放变暂停时的平滑动画（1 -> 0）
    // 通过将此状态放置于最外层，可以跨动画/静态组件的切换进行共享和过渡
    val activity by animateFloatAsState(
        targetValue = if (isPlaying) 1f else 0f,
        animationSpec = tween(durationMillis = 240, easing = FastOutSlowInEasing),
        label = "activity"
    )

    // 关键优化：当不需要播放（暂停）且过渡动画 activity 已降为 0 时，
    // 完全移除 PlayingEqIconAnimated 组件及其内部的 rememberInfiniteTransition，
    // 释放系统动画时钟（withFrameNanos）的注册，允许设备降低屏幕刷新率并进入省电状态。
    if (isPlaying || activity > 0f) {
        PlayingEqIconAnimated(
            modifier = modifier,
            color = color,
            isPlaying = isPlaying,
            bars = bars,
            minHeightFraction = minHeightFraction,
            maxHeightFraction = maxHeightFraction,
            phaseDurationMillis = phaseDurationMillis,
            wanderDurationMillis = wanderDurationMillis,
            gapFraction = gapFraction,
            activity = activity
        )
    } else {
        PlayingEqIconStatic(
            modifier = modifier,
            color = color,
            bars = bars,
            minHeightFraction = minHeightFraction,
            gapFraction = gapFraction,
            activity = activity
        )
    }
}

@Composable
private fun PlayingEqIconAnimated(
    modifier: Modifier,
    color: Color,
    isPlaying: Boolean,
    bars: Int,
    minHeightFraction: Float,
    maxHeightFraction: Float,
    phaseDurationMillis: Int,
    wanderDurationMillis: Int,
    gapFraction: Float,
    activity: Float
) {
    val fullRotation = (2f * PI).toFloat()
    
    // 使用系统级统一动画心跳
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

    val speeds = remember(bars) { List(bars) { (it + 1).toFloat() } }
    val shifts = remember(bars) { List(bars) { i -> i * 0.9f } }

    // 关键：在 Canvas 的 modifier 上应用 .graphicsLayer() 产生独立的硬件绘制图层（RenderNode）
    Canvas(modifier = modifier.graphicsLayer { clip = true }) {
        // 关键：当处于非播放状态（只是在做 activity 渐变过渡）时，直接使用静态值，绝对不访问 phaseState.value 和 wanderState.value！
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

@Composable
private fun PlayingEqIconStatic(
    modifier: Modifier,
    color: Color,
    bars: Int,
    minHeightFraction: Float,
    gapFraction: Float,
    activity: Float
) {
    // 静态无动画状态：Canvas 完全没有任何 State 读取，彻底静止，耗电为 0
    Canvas(modifier = modifier.graphicsLayer { clip = true }) {
        val w = size.width
        val h = size.height

        val tentativeBarW = w / (bars + (bars - 1) * (1f + gapFraction))
        val gap = tentativeBarW * gapFraction
        val barW = tentativeBarW
        val corner = CornerRadius(barW / 2f, barW / 2f)

        repeat(bars) { i ->
            val fracBars = minHeightFraction
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

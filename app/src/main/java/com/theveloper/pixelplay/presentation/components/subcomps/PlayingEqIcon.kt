package com.theveloper.pixelplay.presentation.components.subcomps

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import kotlin.math.PI
import kotlin.math.sin
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import com.theveloper.pixelplay.presentation.components.LocalScreenActive

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
    val isScreenActive = LocalScreenActive.current
    val effectiveIsPlaying = isPlaying && isScreenActive

    // 状态从暂停变播放或播放变暂停时的平滑动画（1 -> 0）
    val activity by animateFloatAsState(
        targetValue = if (effectiveIsPlaying) 1f else 0f,
        animationSpec = tween(durationMillis = 240, easing = FastOutSlowInEasing),
        label = "activity"
    )

    // 极致优化：一旦 isPlaying 变为 false，我们立刻切换到静态版，彻底且即时销毁 rememberInfiniteTransition，
    // 释放系统动画时钟（withFrameNanos）的注册，允许设备降低屏幕刷新率并进入省电状态。
    if (effectiveIsPlaying) {
        PlayingEqIconAnimated(
            modifier = modifier,
            color = color,
            isPlaying = effectiveIsPlaying,
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
    
    // 极致降本：使用基于协程 delay 的低帧率时钟（20fps），
    // 彻底断开与 Choreographer 的 120Hz 强制绑定，允许系统 RenderThread 和屏幕休眠，大幅度降低运行时功耗。
    val progressState = remember { mutableFloatStateOf(0f) }
    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            val cycleDurationMs = 36000L
            val frameIntervalMs = 50L // 20 fps 帧间隔
            var accumulatedTime = 0L
            while (isActive) {
                delay(frameIntervalMs)
                accumulatedTime = (accumulatedTime + frameIntervalMs) % cycleDurationMs
                progressState.floatValue = accumulatedTime.toFloat() / cycleDurationMs.toFloat()
            }
        }
    }

    val speeds = remember(bars) { List(bars) { (it + 1).toFloat() } }
    val shifts = remember(bars) { List(bars) { i -> i * 0.9f } }

    // 关键：在 Canvas 的 modifier 上应用 .graphicsLayer() 产生独立的硬件绘制图层（RenderNode）
    Canvas(modifier = modifier.graphicsLayer { clip = true }) {
        val progress = if (isPlaying) progressState.floatValue else 0f
        
        // 基于单个 progress 计算出原本的相位与漂移
        val phase = progress * 10f * fullRotation       // 36000 / 3600 = 10 个周期
        val wander = progress * 3f * fullRotation        // 36000 / 12000 = 3 个周期
        
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
    // 我们在此提供一个固定的“冻结高度”集合，避免瞬间跳变，让淡出依然非常平滑
    val frozenFractions = remember(bars) {
        when (bars) {
            3 -> listOf(0.55f, 0.85f, 0.40f)
            4 -> listOf(0.40f, 0.75f, 0.85f, 0.50f)
            5 -> listOf(0.35f, 0.60f, 0.85f, 0.70f, 0.45f)
            else -> List(bars) { i -> 0.35f + (i % 3) * 0.25f }
        }
    }

    Canvas(modifier = modifier.graphicsLayer { clip = true }) {
        val w = size.width
        val h = size.height

        val tentativeBarW = w / (bars + (bars - 1) * (1f + gapFraction))
        val gap = tentativeBarW * gapFraction
        val barW = tentativeBarW
        val corner = CornerRadius(barW / 2f, barW / 2f)

        repeat(bars) { i ->
            val peakFrac = frozenFractions.getOrElse(i) { minHeightFraction }
            val barH = h * peakFrac
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

package ch.nicolab.cadence

import java.math.BigDecimal
import java.math.RoundingMode
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

internal fun defaultCurrencyCode(locale: Locale = Locale.getDefault()): String =
    runCatching { Currency.getInstance(locale).currencyCode }.getOrDefault("CHF")

internal fun parseDailySavingsMinor(value: String, currencyCode: String): Long? {
    if (value.isBlank()) return null
    val currency = runCatching { Currency.getInstance(currencyCode) }.getOrNull() ?: return null
    return runCatching {
        BigDecimal(value.trim().replace(',', '.'))
            .movePointRight(currency.defaultFractionDigits.coerceAtLeast(0))
            .setScale(0, RoundingMode.UNNECESSARY)
            .longValueExact()
            .takeIf { it > 0L }
    }.getOrNull()
}

internal fun dailySavingsInput(minor: Long?, currencyCode: String): String {
    if (minor == null) return ""
    val digits = runCatching { Currency.getInstance(currencyCode).defaultFractionDigits }.getOrDefault(2).coerceAtLeast(0)
    return BigDecimal.valueOf(minor, digits).stripTrailingZeros().toPlainString()
}

internal fun formatMoney(minor: Long, currencyCode: String, locale: Locale = Locale.getDefault()): String {
    val currency = runCatching { Currency.getInstance(currencyCode) }.getOrElse { Currency.getInstance("CHF") }
    val formatter = NumberFormat.getCurrencyInstance(locale).apply { this.currency = currency }
    return formatter.format(BigDecimal.valueOf(minor, currency.defaultFractionDigits.coerceAtLeast(0)))
}

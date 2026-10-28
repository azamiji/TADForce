public class LegacyRateHelper {
    public static Decimal monthly(Decimal amount, Decimal rate, Integer months) {
        return amount * rate / (1 - Math.pow(1 + rate.doubleValue(), -months));
    }
}

@isTest
private class LegacyRateHelperTest {
    @isTest static void computes() {
        Assert.isTrue(LegacyRateHelper.monthly(1000, 0.01, 12) > 0);
    }
}

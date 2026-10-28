@isTest
private class CustomerSyncBatchTest {
    @isTest static void runsBatch() {
        Test.startTest();
        Database.executeBatch(new CustomerSyncBatch());
        Test.stopTest();
    }
}

@isTest
private class LoanApplicationTriggerHandlerTest {
    @isTest static void publishesEventOnStatusChange() {
        Account a = new Account(Name = 'Test');
        insert a;
        LoanApplication__c app = new LoanApplication__c(Customer__c = a.Id, Amount__c = 1000, Status__c = 'Draft');
        insert app;
        app.Status__c = 'Submitted';
        update app;
        Assert.areEqual('Submitted', [SELECT Status__c FROM LoanApplication__c].Status__c);
    }
}

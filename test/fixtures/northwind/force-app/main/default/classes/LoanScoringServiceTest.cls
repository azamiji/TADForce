@isTest
private class LoanScoringServiceTest {
    @isTest static void scoresExistingCustomer() {
        Account a = new Account(Name = 'Test');
        insert a;
        LoanApplication__c app = new LoanApplication__c(Customer__c = a.Id, Amount__c = 1000);
        LoanScoringService.score(new List<LoanApplication__c>{ app });
        Assert.isNotNull(app.Score__c);
    }
}

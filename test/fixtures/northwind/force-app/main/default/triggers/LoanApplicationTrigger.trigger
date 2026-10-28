trigger LoanApplicationTrigger on LoanApplication__c (before insert, before update, after update) {
    new LoanApplicationTriggerHandler().run();
}

/** Data access for loan applications (user mode). */
public inherited sharing class LoanApplicationSelector {
    public static Map<Id, Account> customersOf(List<LoanApplication__c> apps) {
        Set<Id> ids = new Set<Id>();
        for (LoanApplication__c a : apps) ids.add(a.Customer__c);
        return new Map<Id, Account>([SELECT Id, NWB_CustomerNumber__c FROM Account WHERE Id IN :ids WITH USER_MODE]);
    }
}

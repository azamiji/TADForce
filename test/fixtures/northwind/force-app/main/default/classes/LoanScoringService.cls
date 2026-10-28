/** Computes the loan score from the rules configured in ScoringRule__mdt. */
public with sharing class LoanScoringService {
    public static void score(List<LoanApplication__c> apps) {
        Map<String, Decimal> weights = new Map<String, Decimal>();
        for (ScoringRule__mdt r : ScoringRule__mdt.getAll().values()) weights.put(r.Criterion__c, r.Weight__c);
        Map<Id, Account> customers = LoanApplicationSelector.customersOf(apps);
        for (LoanApplication__c app : apps) {
            Decimal s = 0;
            if (customers.containsKey(app.Customer__c) && weights.containsKey('ExistingCustomer')) s += weights.get('ExistingCustomer');
            app.Score__c = s;
        }
    }
}

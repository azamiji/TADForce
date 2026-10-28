/** Trigger logic of LoanApplication__c: scoring before save, events and archiving after update. */
public with sharing class LoanApplicationTriggerHandler {
    public void run() {
        if (Trigger.isBefore) {
            LoanScoringService.score((List<LoanApplication__c>) Trigger.new);
        } else if (Trigger.isAfter && Trigger.isUpdate) {
            List<LoanStatusChange__e> events = new List<LoanStatusChange__e>();
            List<Id> decided = new List<Id>();
            for (LoanApplication__c app : (List<LoanApplication__c>) Trigger.new) {
                LoanApplication__c old = (LoanApplication__c) Trigger.oldMap.get(app.Id);
                if (app.Status__c != old.Status__c) {
                    events.add(new LoanStatusChange__e(LoanApplicationId__c = app.Id, NewStatus__c = app.Status__c));
                    if (app.Status__c == 'Approved' || app.Status__c == 'Rejected') decided.add(app.Id);
                }
            }
            if (!events.isEmpty()) EventBus.publish(events);
            if (!decided.isEmpty()) System.enqueueJob(new DocumentArchiveQueueable(decided));
        }
    }
}

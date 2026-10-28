/** Lead logic: default branch and score at creation. */
public with sharing class LeadTriggerHandler {
    public void run() {
        if (Trigger.isBefore && Trigger.isInsert) {
            for (Lead l : (List<Lead>) Trigger.new) if (l.Score__c == null) l.Score__c = 0;
        }
    }
}

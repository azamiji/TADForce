/** Nightly synchronisation of customer reference data, upserted on NWB_CustomerNumber__c. */
public without sharing class CustomerSyncBatch implements Database.Batchable<SObject>, Database.AllowsCallouts, Schedulable {
    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator([SELECT Id, NWB_CustomerNumber__c FROM Account WHERE NWB_CustomerNumber__c != null]);
    }
    public void execute(Database.BatchableContext bc, List<Account> scope) {
        for (Account a : scope) a.Segment__c = CoreBankingClient.positions(a.NWB_CustomerNumber__c).isEmpty() ? 'Prospect' : 'Customer';
        Database.update(scope, false);
    }
    public void finish(Database.BatchableContext bc) {}
    public void execute(SchedulableContext sc) { Database.executeBatch(new CustomerSyncBatch(), 50); }
}

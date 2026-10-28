/** Controller of the customer360 LWC: live positions from the core banking system. */
public with sharing class Customer360Controller {
    @AuraEnabled(cacheable=true)
    public static List<CoreBankingClient.Position> getPositions(Id accountId) {
        Account a = [SELECT NWB_CustomerNumber__c FROM Account WHERE Id = :accountId WITH USER_MODE];
        return CoreBankingClient.positions(a.NWB_CustomerNumber__c);
    }
}

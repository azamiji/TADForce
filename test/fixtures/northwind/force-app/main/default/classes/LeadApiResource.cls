/** Inbound API used by the mobile banking app to create leads. */
@RestResource(urlMapping='/leads/v1/*')
global with sharing class LeadApiResource {
    @HttpPost
    global static Id createLead(String lastName, String channel, String customerNumber) {
        Lead l = new Lead(LastName = lastName, Company = lastName, Channel__c = channel);
        insert as user l;
        return l.Id;
    }
}

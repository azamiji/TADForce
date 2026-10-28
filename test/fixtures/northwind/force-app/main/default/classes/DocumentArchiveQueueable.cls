/** Sends the documents of decided applications to the document store. */
public with sharing class DocumentArchiveQueueable implements Queueable, Database.AllowsCallouts {
    private final List<Id> applicationIds;
    public DocumentArchiveQueueable(List<Id> applicationIds) { this.applicationIds = applicationIds; }
    public void execute(QueueableContext ctx) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:NWB_DocumentStore/archive');
        req.setMethod('POST');
        req.setBody(JSON.serialize(applicationIds));
        new Http().send(req);
    }
}

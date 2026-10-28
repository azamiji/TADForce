/** Read-only access to the core banking API through a named credential. */
public with sharing class CoreBankingClient {
    public class Position { @AuraEnabled public String product; @AuraEnabled public Decimal balance; }
    public static List<Position> positions(String customerNumber) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:NWB_CoreBanking/customers/' + EncodingUtil.urlEncode(customerNumber, 'UTF-8') + '/positions');
        req.setMethod('GET');
        req.setTimeout(10000);
        HttpResponse res = new Http().send(req);
        return (List<Position>) JSON.deserialize(res.getBody(), List<Position>.class);
    }
}

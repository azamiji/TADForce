/** SMS notifications to customers through the SMS gateway. */
public with sharing class SmsNotificationService {
    @InvocableMethod(label='Send document reminders' category='Notifications')
    public static void sendReminders(List<Id> applicationIds) { send(applicationIds); }
    @future(callout=true)
    public static void send(List<Id> applicationIds) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint('callout:NWB_SmsGateway/messages');
        req.setMethod('POST');
        req.setBody(JSON.serialize(applicationIds));
        new Http().send(req);
    }
}

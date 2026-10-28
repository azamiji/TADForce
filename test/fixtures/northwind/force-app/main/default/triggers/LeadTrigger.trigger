trigger LeadTrigger on Lead (before insert) {
    new LeadTriggerHandler().run();
}

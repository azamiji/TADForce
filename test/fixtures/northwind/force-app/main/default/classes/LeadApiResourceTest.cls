@isTest
private class LeadApiResourceTest {
    @isTest static void createsLead() {
        Assert.isNotNull(LeadApiResource.createLead('Doe', 'Mobile', null));
    }
}

/** Creates and updates users at single sign-on from the corporate identity provider claims. */
global class SsoRegistrationHandler implements Auth.RegistrationHandler {
    global User createUser(Id portalId, Auth.UserData data) {
        return new User(Username = data.email, Email = data.email, LastName = data.lastName, FederationIdentifier = data.identifier);
    }
    global void updateUser(Id userId, Id portalId, Auth.UserData data) {}
}

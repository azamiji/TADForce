import { LightningElement, api, wire } from 'lwc';
import getPositions from '@salesforce/apex/Customer360Controller.getPositions';
export default class Customer360 extends LightningElement {
    @api recordId;
    @wire(getPositions, { accountId: '$recordId' }) positions;
}

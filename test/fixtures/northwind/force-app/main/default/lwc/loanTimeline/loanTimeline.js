import { LightningElement, api, wire } from 'lwc';
import { subscribe, MessageContext } from 'lightning/messageService';
export default class LoanTimeline extends LightningElement {
    @api recordId;
    @wire(MessageContext) messageContext;
}

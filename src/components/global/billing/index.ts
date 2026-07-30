/*
 * Copyright (c) 2026 Web Prodigies LLC
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

/**
 * SOURCE OF TRUTH KEYWORDS: StripeElementsProvider, PaymentCardForm,
 *   PlanSelector, BillingIntervalToggle, PaymentMethodRow,
 *   AddPaymentMethodDialog, ChangePlanDialog
 *
 * WHAT:  Barrel for the reusable Stripe/billing UI primitives.
 * WHY:   One import surface for the onboarding payment step and the billing
 *        settings tab.
 * WHERE: Imported by onboarding + settings/billing UI.
 */

export { StripeElementsProvider } from './stripe-elements-provider'
export { PaymentCardForm } from './payment-card-form'
export { PlanSelector, BillingIntervalToggle } from './plan-selector'
export { PaymentMethodRow } from './payment-method-row'
export { AddPaymentMethodDialog } from './add-payment-method-dialog'
export { ChangePlanDialog } from './change-plan-dialog'

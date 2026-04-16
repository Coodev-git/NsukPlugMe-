'use strict';

const ContactUnlock = require('../models/ContactUnlock');
const User          = require('../models/User');
const paymentSvc    = require('../services/payment.service');
const notifSvc      = require('../services/notification.service');
const R             = require('../utils/apiResponse');
const logger        = require('../utils/logger');

// ── INITIATE UNLOCK (Student pays) ───────────────────────────
exports.initiateUnlock = async (req, res, next) => {
  try {
    if (req.user.role !== 'student')
      return R.forbidden(res, 'Only students can unlock worker contacts');

    const { workerId } = req.params;
    const worker = await User.findById(workerId).select('name phone role');
    if (!worker || worker.role !== 'worker')
      return R.notFound(res, 'Worker not found');

    if (!worker.phone)
      return R.fail(res, 'This worker has not added a phone number yet');

    // Check if already unlocked
    const existing = await ContactUnlock.findOne({
      student: req.user._id,
      worker:  workerId,
      isActive: true,
    });
    if (existing)
      return R.ok(res, { alreadyUnlocked: true, phone: worker.phone }, 'Contact already unlocked');

    // Initialize payment
    const paymentData = await paymentSvc.initialize({
      email:    req.user.email,
      amount:   paymentSvc.PRICE_KOBO,
      metadata: {
        studentId: req.user._id.toString(),
        workerId:  workerId,
        type:      'contact_unlock',
      },
    });

    // Create pending unlock record
    const unlock = await ContactUnlock.create({
      student:    req.user._id,
      worker:     workerId,
      amountPaid: paymentSvc.PRICE_KOBO,
      paymentRef: paymentData.reference,
    });

    logger.info(`Contact unlock initiated: student=${req.user._id} worker=${workerId} ref=${paymentData.reference}`);

    return R.ok(res, {
      paymentUrl:  paymentData.authorization_url,
      reference:   paymentData.reference,
      amountNaira: Math.round(paymentSvc.PRICE_KOBO / 100),
    }, 'Payment initiated — complete payment to unlock contact');
  } catch (err) {
    next(err);
  }
};

// ── VERIFY PAYMENT & REVEAL PHONE ─────────────────────────────
exports.verifyUnlock = async (req, res, next) => {
  try {
    const { reference } = req.params;

    const unlock = await ContactUnlock.findOne({ paymentRef: reference });
    if (!unlock) return R.notFound(res, 'Unlock record not found');

    if (unlock.student.toString() !== req.user._id.toString())
      return R.forbidden(res, 'This unlock record does not belong to you');

    // Already verified
    if (unlock.isActive) {
      const worker = await User.findById(unlock.worker).select('name phone');
      return R.ok(res, { phone: worker.phone, workerName: worker.name }, 'Contact already unlocked');
    }

    // Verify with payment gateway
    const payment = await paymentSvc.verify(reference);

    unlock.gatewayResponse = payment;
    unlock.paymentStatus   = payment.status === 'success' ? 'success' : 'failed';

    if (payment.status !== 'success') {
      await unlock.save();
      return R.fail(res, 'Payment was not successful — please try again', 402);
    }

    // Activate unlock
    unlock.isActive = true;
    await unlock.save();

    // Get worker phone
    const worker = await User.findById(unlock.worker).select('name phone');

    // Notify worker
    await notifSvc.contactUnlocked(unlock.worker, req.user.name);

    logger.info(`Contact unlock successful: student=${req.user._id} worker=${unlock.worker}`);

    return R.ok(res, {
      phone:      worker.phone,
      workerName: worker.name,
      paidNaira:  Math.round(unlock.amountPaid / 100),
    }, '🔓 Contact unlocked successfully');
  } catch (err) {
    next(err);
  }
};

// ── CHECK UNLOCK STATUS (no payment, just check) ──────────────
exports.checkUnlock = async (req, res, next) => {
  try {
    const { workerId } = req.params;

    const unlock = await ContactUnlock.findOne({
      student:  req.user._id,
      worker:   workerId,
      isActive: true,
    });

    if (!unlock) return R.ok(res, { unlocked: false });

    const worker = await User.findById(workerId).select('name phone');
    return R.ok(res, { unlocked: true, phone: worker.phone, workerName: worker.name });
  } catch (err) {
    next(err);
  }
};

// ── ADMIN: UNLOCK HISTORY ─────────────────────────────────────
exports.unlockHistory = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total   = await ContactUnlock.countDocuments();
    const records = await ContactUnlock.find()
      .populate('student', 'name email')
      .populate('worker',  'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    return R.paginate(res, records, total, page, limit);
  } catch (err) {
    next(err);
  }
};

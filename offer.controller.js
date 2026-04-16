'use strict';

const mongoose = require('mongoose');
const Offer    = require('../models/Offer');
const Job      = require('../models/Job');
const { Chat, Message } = require('../models/Chat');
const User     = require('../models/User');
const notifSvc = require('../services/notification.service');
const R        = require('../utils/apiResponse');
const logger   = require('../utils/logger');

// ── SUBMIT OFFER (Worker) ─────────────────────────────────────
exports.submitOffer = async (req, res, next) => {
  try {
    const { price, message, eta } = req.body;
    const jobId = req.params.jobId;

    if (req.user.role !== 'worker')
      return R.forbidden(res, 'Only workers can place offers');

    const job = await Job.findById(jobId);
    if (!job)             return R.notFound(res, 'Job not found');
    if (job.status !== 'open') return R.fail(res, 'This job is no longer accepting offers');

    if (job.student.toString() === req.user._id.toString())
      return R.fail(res, 'You cannot offer on your own job');

    // Check for existing offer
    const existing = await Offer.findOne({ job: jobId, worker: req.user._id });
    if (existing) {
      if (existing.status === 'pending')
        return R.fail(res, 'You already have a pending offer on this job', 409);
      // Allow re-offer if previous was withdrawn/rejected
      existing.price   = price;
      existing.message = message;
      existing.eta     = eta;
      existing.status  = 'pending';
      existing.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await existing.save();

      await Job.findByIdAndUpdate(jobId, { $inc: { offerCount: 0 } }); // no increment on re-offer
      await notifSvc.newOffer(job.student, req.user.name, jobId, existing._id);
      return R.ok(res, { offer: existing }, 'Offer updated');
    }

    const offer = await Offer.create({
      job:     jobId,
      worker:  req.user._id,
      student: job.student,
      price,
      message,
      eta,
    });

    // Increment offer count on job
    await Job.findByIdAndUpdate(jobId, { $inc: { offerCount: 1 } });

    // Notify student
    await notifSvc.newOffer(job.student, req.user.name, jobId, offer._id);

    logger.info(`Offer submitted: worker=${req.user._id} job=${jobId} price=₦${price}`);
    return R.created(res, { offer }, 'Offer submitted successfully');
  } catch (err) {
    next(err);
  }
};

// ── LIST OFFERS FOR A JOB (Student) ──────────────────────────
exports.listOffers = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) return R.notFound(res, 'Job not found');

    if (job.student.toString() !== req.user._id.toString())
      return R.forbidden(res, 'Only the job owner can view its offers');

    const offers = await Offer.find({ job: req.params.jobId, status: 'pending' })
      .populate('worker', 'name avatar rating ratingCount skills campusCred plan')
      .sort({ createdAt: 1 });

    return R.ok(res, { offers, count: offers.length });
  } catch (err) {
    next(err);
  }
};

// ── ACCEPT OFFER — THE MOST CRITICAL ENDPOINT ─────────────────
/**
 * FLOW when student accepts an offer:
 * 1. Validate: job is open, student owns it, offer is pending
 * 2. Accept the chosen offer → status = 'accepted'
 * 3. Reject all other offers for the same job
 * 4. Assign worker to job → job.assignedWorker = worker._id
 * 5. Update job status: open → in_progress
 * 6. AUTO-CREATE chat room between student and worker
 * 7. Post system message in chat: "Chat started — work begins"
 * 8. Link chatId back to the accepted offer
 * 9. Notify worker via Socket.IO + Notification
 * 10. Return { job, offer, chat } to the student
 */
exports.acceptOffer = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { jobId, offerId } = req.params;

    // ── 1. Validate ───────────────────────────────────────────
    const job   = await Job.findById(jobId).session(session);
    const offer = await Offer.findById(offerId).session(session);

    if (!job)   return R.notFound(res, 'Job not found');
    if (!offer) return R.notFound(res, 'Offer not found');

    if (job.student.toString() !== req.user._id.toString())
      return R.forbidden(res, 'Only the job owner can accept offers');

    if (job.status !== 'open')
      return R.fail(res, `Job is already ${job.status} — cannot accept offers`);

    if (offer.job.toString() !== jobId)
      return R.fail(res, 'Offer does not belong to this job');

    if (offer.status !== 'pending')
      return R.fail(res, `Offer is already ${offer.status}`);

    // ── 2. Accept this offer ──────────────────────────────────
    offer.status = 'accepted';
    await offer.save({ session });

    // ── 3. Reject all other pending offers for this job ───────
    await Offer.updateMany(
      { job: jobId, _id: { $ne: offerId }, status: 'pending' },
      { status: 'rejected' },
      { session }
    );

    // Notify rejected workers (fire-and-forget, outside transaction)
    Offer.find({ job: jobId, status: 'rejected' })
      .then(rejectedOffers => {
        rejectedOffers.forEach(ro =>
          notifSvc.offerRejected(ro.worker, job.title, jobId, ro._id)
        );
      })
      .catch(e => logger.warn('Reject notify failed: ' + e.message));

    // ── 4 & 5. Assign worker + update job status ──────────────
    job.assignedWorker = offer.worker;
    job.agreedPrice    = offer.price;
    job.transitionStatus('in_progress', `Offer ${offerId} accepted`);
    await job.save({ session });

    // ── 6. AUTO-CREATE CHAT ROOM ──────────────────────────────
    const chat = await Chat.create(
      [{
        job:          jobId,
        offer:        offerId,
        participants: [job.student, offer.worker],
        unreadCounts: { [offer.worker.toString()]: 1 },
      }],
      { session }
    );
    const chatDoc = chat[0];

    // ── 7. Post system message in chat ────────────────────────
    const systemMsg = `✅ Chat created. ${req.user.name} accepted the offer of ₦${offer.price}. Work begins now!`;
    await Message.create(
      [{
        chat:     chatDoc._id,
        sender:   req.user._id,
        text:     systemMsg,
        type:     'system',
        isSystem: true,
        readBy:   [req.user._id],
      }],
      { session }
    );

    // Update chat's lastMessage snapshot
    chatDoc.lastMessage = { text: systemMsg, sender: req.user._id, timestamp: new Date() };
    await chatDoc.save({ session });

    // ── 8. Link chatId to offer ───────────────────────────────
    offer.chatId = chatDoc._id;
    await offer.save({ session });

    // ── Commit transaction ────────────────────────────────────
    await session.commitTransaction();
    session.endSession();

    // ── 9. Notify worker (real-time + push) ───────────────────
    await notifSvc.offerAccepted(
      offer.worker,
      req.user.name,
      jobId,
      offerId,
      chatDoc._id
    );

    // Socket: tell the worker to redirect to chat
    const io = require('../socket/socket').getIO();
    if (io) {
      io.to(`user:${offer.worker.toString()}`).emit('offer_accepted', {
        jobId:   jobId,
        offerId: offerId,
        chatId:  chatDoc._id.toString(),
        message: systemMsg,
      });
    }

    // ── 10. Return to student ─────────────────────────────────
    await job.populate('assignedWorker', 'name avatar rating skills phone');
    await chatDoc.populate('participants', 'name avatar role');

    logger.info(`✅ Offer accepted: job=${jobId} worker=${offer.worker} chat=${chatDoc._id}`);

    return R.ok(res, {
      job,
      offer,
      chat: chatDoc,
    }, 'Offer accepted — chat room created automatically');

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    next(err);
  }
};

// ── REJECT OFFER (Student) ────────────────────────────────────
exports.rejectOffer = async (req, res, next) => {
  try {
    const { jobId, offerId } = req.params;
    const job   = await Job.findById(jobId);
    const offer = await Offer.findById(offerId);

    if (!job || !offer) return R.notFound(res, 'Job or offer not found');
    if (job.student.toString() !== req.user._id.toString())
      return R.forbidden(res, 'Only the job owner can reject offers');

    offer.status = 'rejected';
    await offer.save();
    await notifSvc.offerRejected(offer.worker, job.title, jobId, offerId);

    return R.ok(res, null, 'Offer rejected');
  } catch (err) {
    next(err);
  }
};

// ── WITHDRAW OFFER (Worker) ───────────────────────────────────
exports.withdrawOffer = async (req, res, next) => {
  try {
    const offer = await Offer.findById(req.params.offerId);
    if (!offer) return R.notFound(res, 'Offer not found');
    if (offer.worker.toString() !== req.user._id.toString())
      return R.forbidden(res, 'You can only withdraw your own offer');
    if (offer.status !== 'pending')
      return R.fail(res, 'Only pending offers can be withdrawn');

    offer.status = 'withdrawn';
    await offer.save();
    await Job.findByIdAndUpdate(offer.job, { $inc: { offerCount: -1 } });

    return R.ok(res, null, 'Offer withdrawn');
  } catch (err) {
    next(err);
  }
};

// ── WORKER: MY OFFERS ─────────────────────────────────────────
exports.myOffers = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter = { worker: req.user._id };
    if (status) filter.status = status;

    const total  = await Offer.countDocuments(filter);
    const offers = await Offer.find(filter)
      .populate('job', 'title category status budget location')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    return R.paginate(res, offers, total, page, limit);
  } catch (err) {
    next(err);
  }
};

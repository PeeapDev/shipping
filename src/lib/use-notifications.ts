"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playNewJobSound, playMessageSound, playDeliverySound } from "./sounds";

/**
 * Browser notification hook for the shipping dashboard.
 * Requests permission, tracks new jobs, and shows desktop notifications with sounds.
 *
 * Usage:
 *   const { notifyNewJob, notifyStatusChange, permissionGranted } = useNotifications();
 *   // Call notifyNewJob(job) when polling detects a new job
 */

export function useNotifications() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const seenJobIds = useRef(new Set<string>());

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (Notification.permission === "granted") {
      setPermissionGranted(true);
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        setPermissionGranted(perm === "granted");
      });
    }
  }, []);

  /** Mark a job ID as seen (prevents duplicate notifications) */
  const markSeen = useCallback((jobId: string) => {
    seenJobIds.current.add(jobId);
  }, []);

  /** Check if a job has already been seen */
  const isSeen = useCallback((jobId: string) => {
    return seenJobIds.current.has(jobId);
  }, []);

  /** Show notification for a new delivery job */
  const notifyNewJob = useCallback(
    (job: { id: string; job_number: string; merchant_name?: string; shipping_fee?: number }) => {
      if (seenJobIds.current.has(job.id)) return;
      seenJobIds.current.add(job.id);

      playNewJobSound();

      if (!permissionGranted) return;

      try {
        const n = new Notification("New Delivery Job!", {
          body: `${job.job_number} — ${job.merchant_name || "New order"}${job.shipping_fee ? ` (NLe ${Number(job.shipping_fee).toLocaleString()})` : ""}`,
          icon: "/favicon.ico",
          tag: `new-job-${job.id}`,
          requireInteraction: true,
        });
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        // Notification API not available
      }
    },
    [permissionGranted]
  );

  /** Show notification for a status change */
  const notifyStatusChange = useCallback(
    (params: { job_number: string; status: string; message?: string }) => {
      const statusLabels: Record<string, string> = {
        assigned: "Driver assigned",
        picked_up: "Package picked up",
        in_transit: "In transit",
        delivered: "Delivered",
        completed: "Delivery completed",
        cancelled: "Cancelled",
        failed: "Delivery failed",
      };

      // Play appropriate sound
      if (params.status === "completed" || params.status === "delivered") {
        playDeliverySound();
      } else {
        playMessageSound();
      }

      if (!permissionGranted) return;

      try {
        const n = new Notification(
          `${params.job_number} — ${statusLabels[params.status] || params.status}`,
          {
            body: params.message || `Status updated to ${params.status}`,
            icon: "/favicon.ico",
            tag: `status-${params.job_number}-${params.status}`,
          }
        );
        n.onclick = () => {
          window.focus();
          n.close();
        };
      } catch {
        // Notification API not available
      }
    },
    [permissionGranted]
  );

  return {
    permissionGranted,
    notifyNewJob,
    notifyStatusChange,
    markSeen,
    isSeen,
  };
}

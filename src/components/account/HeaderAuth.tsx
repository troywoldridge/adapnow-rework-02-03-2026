"use client";

import * as React from "react";
import Link from "next/link";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";

type Props = {
  className?: string;
};

export default function HeaderAuth({ className }: Props) {
  return (
    <div className={className}>
      <SignedOut>
        <div className="flex items-center gap-2">
          <SignInButton mode="modal">
            <button
              type="button"
              className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-black/5"
            >
              Sign in
            </button>
          </SignInButton>

          <Link
            href="/account"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Account
          </Link>
        </div>
      </SignedOut>

      <SignedIn>
        <div className="flex items-center gap-3">
          <Link
            href="/account"
            className="rounded-md border px-3 py-2 text-sm font-medium hover:bg-black/5"
          >
            Account
          </Link>

          <UserButton afterSignOutUrl="/" />
        </div>
      </SignedIn>
    </div>
  );
}

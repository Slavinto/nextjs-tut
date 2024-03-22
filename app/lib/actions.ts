'use server';

import type { Invoice } from './definitions';
import { sql } from '@vercel/postgres';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';

const formSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a valid customer',
    required_error: 'Please select a customer',
  }),
  amount: z.coerce.number().gt(0, 'Please enter an amount greater than $0'),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select a valid invoice status',
    required_error: 'Please select an invoice status',
  }),
  date: z.string(),
});

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

const CreateInvoice = formSchema.omit({ id: true, date: true });
const UpdateInvoice = formSchema.omit({ id: true, date: true });

export async function createInvoice(PrevState: State, formData: FormData) {
  const rawFormData = Object.fromEntries(formData.entries());

  const parsedFormData = CreateInvoice.safeParse(rawFormData);

  if (!parsedFormData.success) {
    return {
      errors: parsedFormData.error.flatten().fieldErrors,
      message: 'Missing fields - failed to create invoice',
    };
  }

  const amountInCents = parsedFormData.data.amount * 100;
  const date = new Date().toISOString().split('T')[0];

  try {
    await sql`INSERT INTO invoices (customer_id, amount, status, date)
    VALUES (${parsedFormData.data.customerId}, ${amountInCents}, ${parsedFormData.data.status}, ${date})`;
  } catch (error) {
    return {
      message: 'Database Error. Failed to create invoice.',
    };
  }
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function updateInvoice(
  id: string,
  PrevState: State,
  formData: FormData,
) {
  const rawFormData = Object.fromEntries(formData.entries());
  const parsedFormData = UpdateInvoice.safeParse(rawFormData);

  const { success } = parsedFormData;
  if (!success) {
    return {
      errors: parsedFormData.error.flatten().fieldErrors,
      message: 'Missing fields - failed to edit invoice',
    };
  }

  const { customerId, amount, status } = parsedFormData.data;

  const amountInCents = amount * 100;

  try {
    await sql`
  UPDATE invoices
  SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
  WHERE id = ${id}
  `;
  } catch (error) {
    return {
      message: 'Database Error. Failed to update invoice.',
    };
  }

  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
  } catch (error) {
    return {
      message: 'Database Error. Failed to delete invoice.',
    };
  }
  revalidatePath('/dashboard/invoices');
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}

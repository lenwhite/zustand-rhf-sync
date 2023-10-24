import { useEffect, useRef } from "react";
import {
  DefaultValues,
  FieldValues,
  Path,
  PathValue,
  UseFormProps,
  UseFormReturn,
  useForm,
} from "react-hook-form";
import { StoreApi, UseBoundStore } from "zustand";
import { deepCloneWithoutFunctions, deepCompareDifferences } from "./utils";

/**
 * Syncs a zustand store (or part of a zustand store) with the form state in react-hook-forms
 *
 * @param useStore The zustand store that you're syncing with
 * @param storeSetter The setter function for the portion of the store that you're syncing with (similar to the handleSubmit function)
 * @param storeSelector The selector function for the portion of the store that you're syncing with (usually the defaultValues passed to useForm)
 * @param useFormResult The return value of useForm from react-hook-form
 */
export function useSyncRHFWithStore<T, F extends FieldValues>(
  useStore: UseBoundStore<StoreApi<T>>,
  storeSetter: (formValue: F) => void,
  storeSelector: (state: T) => F,
  { handleSubmit, watch, setValue, trigger, formState }: UseFormReturn<F>,
  mode: UseFormProps<F>["mode"] = "onSubmit",
  reValidateMode: UseFormProps<F>["reValidateMode"] = "onChange",
): void {
  const mutex = useRef(false);

  // refs that are ignored by useEffect
  const storeSetterRef = useRef(storeSetter);
  const storeSelectorRef = useRef(storeSelector);
  const isSubmittedRef = useRef(formState.isSubmitted);
  const setValueRef = useRef(setValue);
  const triggerRef = useRef(trigger);

  storeSetterRef.current = storeSetter;
  storeSelectorRef.current = storeSelector;
  isSubmittedRef.current = formState.isSubmitted;
  setValueRef.current = setValue;
  triggerRef.current = trigger;

  // syncs form to store
  useEffect(() => {
    const formWatcher = watch((data) => {
      if (!mutex.current) {
        mutex.current = true;
        storeSetterRef.current({
          ...storeSelectorRef.current(useStore.getState()),
          ...data,
        });
        mutex.current = false;
      }
    });
    return () => formWatcher.unsubscribe();
  }, [handleSubmit, useStore, watch]);

  // syncs store to form
  useEffect(() => {
    return useStore.subscribe((state, prevState) => {
      if (!mutex.current) {
        mutex.current = true;
        deepCompareDifferences(
          state as Record<string, unknown>,
          prevState as Record<string, unknown>,
          (_path, newValue) => {
            const path = _path as unknown as Path<F>;
            setValueRef.current(path, newValue as PathValue<F, Path<F>>, {
              shouldDirty: true,
              shouldTouch: true,
            });
            if (!isSubmittedRef.current && mode !== "onSubmit") {
              triggerRef.current(path);
            } else if (
              isSubmittedRef.current &&
              reValidateMode !== "onSubmit"
            ) {
              triggerRef.current(path);
            }
          },
        );
        mutex.current = false;
      }
    });
  }, [mode, reValidateMode, trigger, useStore]);
}

export function useFormWithStore<T, F extends FieldValues>(
  useStore: UseBoundStore<StoreApi<T>>,
  storeSetter: (values: F) => void,
  storeSelector: (state: T) => F & Record<string, unknown>,
  useFormOptions?: UseFormProps<F>,
) {
  useFormOptions = {
    defaultValues: deepCloneWithoutFunctions(
      storeSelector(useStore.getState()),
    ) as DefaultValues<F>,
    ...useFormOptions,
  };
  const { mode, reValidateMode } = useFormOptions;
  const form = useForm<F>(useFormOptions);
  useSyncRHFWithStore(
    useStore,
    storeSetter,
    storeSelector,
    form,
    mode,
    reValidateMode,
  );
  return form;
}

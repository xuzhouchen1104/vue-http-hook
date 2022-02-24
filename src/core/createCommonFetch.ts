import { isSSR } from './../utils/index';
import { BaseOptions } from '../types/options';
import { HttpRequest, Mutate, Query, State, UnwrapRefs } from '../types/request';
import { Ref, ref } from 'vue';
import { HttpRequestResult } from '../types/request';
import { generateRequestKey, genRequest, isFunction, setStateRelation } from '../utils';
import { CACHE } from '../utils/cache';
import { DEFAULT_PARALLEL_KEY, DEFAULT_CACHE_TIME } from '../utils/cons';

export const createCommonFetch = <P extends unknown[], R>(
  request: HttpRequest<P, R>,
  option: BaseOptions<P, R>,
  initialData?: Partial<UnwrapRefs<State<P, R>>>,
): HttpRequestResult<P, R> => {
  const loading = ref(initialData?.loading ?? false);
  const error = ref(initialData?.error ?? null);
  const data = <Ref<R>>ref(initialData?.data ?? null);
  const params = <Ref<P>>ref(initialData?.params ?? null);

  const query = genRequest<P, R>(request);

  const setState = setStateRelation<P, R>(
    {
      loading,
      error,
      data,
      params,
    },
    (state) => {
      const cacheKey = option?.cacheKey ?? '';
      const cacheTime = option?.cacheTime ?? DEFAULT_CACHE_TIME;
      const parallelKey = option?.parallelKey?.(...state.params.value) ?? DEFAULT_PARALLEL_KEY;
      CACHE.update(cacheKey, state, cacheTime, parallelKey);
    },
  );

  // loading 闪烁问题 处理
  // 1. 延迟loading = true ✅
  // 2. 延迟loading = false
  const loadingDelayTimer = ref();
  const handleLoadingDelay = () => {
    if (option?.delayLoadingTime) {
      loadingDelayTimer.value = setTimeout(setState, option?.delayLoadingTime, { loading: true });
    }
  };

  const handleSSRCache = (...args: P) => {
    if (isSSR) {
      console.log(generateRequestKey(request, args));
    }
  };

  const load = (...args: P) => {
    handleSSRCache(...args);
    setState({
      loading: true,
      params: args,
    });
    handleLoadingDelay();

    return query(...args)
      .then((res) => {
        const result = option?.formatData ? option?.formatData(res) : res;
        setState({
          data: result,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        setState({
          data: null,
          loading: false,
          error: error,
        });
      })
      .finally(() => {
        loadingDelayTimer && clearTimeout(loadingDelayTimer.value);
      });
  };

  const mutate: Mutate<R> = (value) => {
    const newData = isFunction(value) ? value(data.value) : value;
    setState({
      data: newData,
    });
  };

  const refresh = () => {
    load(...params.value);
  };

  return {
    loading,
    error,
    params,
    data,
    load,
    mutate,
    refresh,
  };
};

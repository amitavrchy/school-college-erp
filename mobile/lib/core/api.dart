import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import 'school.dart';
import 'store.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;
  bool get offline => status == 0;
  @override
  String toString() => message;
}

/// HTTP client for the Campus One API. Adds the access token and campus, renews the 15-minute
/// access token with the refresh token once when a request gets 401, and retries once on 503.
class Api {
  Api(this._store) {
    _dio = Dio(BaseOptions(
      baseUrl: School.apiUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Accept': 'application/json'},
    ));
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) {
        if (accessToken != null && options.extra['noAuth'] != true) {
          options.headers['Authorization'] = 'Bearer $accessToken';
        }
        if (campusId != null) options.headers['x-campus-id'] = campusId;
        handler.next(options);
      },
      onError: (error, handler) async {
        final options = error.requestOptions;
        final status = error.response?.statusCode;
        if (status == 401 && options.extra['noAuth'] != true && options.extra['retried'] != true) {
          if (await _renew()) {
            options.extra['retried'] = true;
            options.headers['Authorization'] = 'Bearer $accessToken';
            try {
              return handler.resolve(await _dio.fetch(options));
            } on DioException catch (e) {
              return handler.next(e);
            }
          }
          await onSessionEnded?.call();
        }
        if (status == 503 && options.extra['retried'] != true) {
          final wait = int.tryParse(error.response?.headers.value('retry-after') ?? '') ?? 3;
          await Future<void>.delayed(Duration(seconds: wait.clamp(1, 5)));
          options.extra['retried'] = true;
          try {
            return handler.resolve(await _dio.fetch(options));
          } on DioException catch (e) {
            return handler.next(e);
          }
        }
        handler.next(error);
      },
    ));
  }

  final Store _store;
  late final Dio _dio;
  String? accessToken;
  String? campusId;

  /// Called when the refresh token is rejected; the app returns to sign-in.
  Future<void> Function()? onSessionEnded;
  Completer<bool>? _renewing;

  /// Exchanges the refresh token for a new pair; concurrent callers share one request.
  Future<bool> _renew() {
    if (_renewing != null) return _renewing!.future;
    final completer = _renewing = Completer<bool>();
    () async {
      try {
        final token = await _store.refreshToken;
        if (token == null) return completer.complete(false);
        final r = await _dio.post<Map<String, dynamic>>('/auth/refresh',
            data: {'refreshToken': token}, options: Options(extra: {'noAuth': true}));
        await useTokens(r.data!);
        completer.complete(true);
      } catch (_) {
        completer.complete(false);
      } finally {
        _renewing = null;
      }
    }();
    return completer.future;
  }

  Future<bool> renew() => _renew();

  Future<void> useTokens(Map<String, dynamic> tokens) async {
    accessToken = tokens['accessToken'] as String?;
    await _store.setRefreshToken(tokens['refreshToken'] as String?);
  }

  ApiException _wrap(Object error) {
    if (error is DioException) {
      final response = error.response;
      if (response == null) return ApiException(0, 'No internet connection');
      final data = response.data;
      final message = data is Map && data['message'] != null ? '${data['message']}' : 'Request failed';
      return ApiException(response.statusCode ?? 0, message);
    }
    return ApiException(-1, '$error');
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    try {
      return (await _dio.get<dynamic>(path, queryParameters: query)).data;
    } catch (e) {
      throw _wrap(e);
    }
  }

  Future<dynamic> post(String path, [Object? body, bool auth = true]) async {
    try {
      return (await _dio.post<dynamic>(path,
              data: body ?? <String, dynamic>{}, options: Options(extra: {'noAuth': !auth})))
          .data;
    } catch (e) {
      throw _wrap(e);
    }
  }

  Future<dynamic> delete(String path) async {
    try {
      return (await _dio.delete<dynamic>(path)).data;
    } catch (e) {
      throw _wrap(e);
    }
  }

  /// Downloads a PDF (receipt, report card) into app storage and opens it in the phone's viewer.
  Future<void> openPdf(String path, String fileName) async {
    try {
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/${fileName.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_')}');
      await _dio.download(path, file.path);
      await OpenFilex.open(file.path, type: 'application/pdf');
    } catch (e) {
      throw _wrap(e);
    }
  }
}

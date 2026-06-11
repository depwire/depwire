package com.example.a

import com.example.b.ServiceB

class ServiceA(private val service: ServiceB) {
    fun useService() = service.getName()
}
